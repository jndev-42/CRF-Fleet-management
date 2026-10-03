import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { DATE_RE, SEASONAL_THEMES, THEME_KEYS, rangesOverlap } from '@/lib/themes/catalog';

/** Jour calendaire réel au format `YYYY-MM-DD` (refuse « 2026-02-31 »). */
const dayString = z.string().regex(DATE_RE, 'Date invalide (format AAAA-MM-JJ attendu)').refine(value => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}, 'Date invalide');

const putSchema = z.object({
    enabled: z.boolean(),
    startDate: dayString.nullable().optional(),
    endDate: dayString.nullable().optional(),
}).superRefine((data, ctx) => {
    if (data.enabled && (!data.startDate || !data.endDate)) {
        ctx.addIssue({ code: 'custom', message: 'Les dates de début et de fin sont requises pour activer un thème', path: ['startDate'] });
        return;
    }
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
        ctx.addIssue({ code: 'custom', message: 'La date de début doit précéder la date de fin', path: ['endDate'] });
    }
});

type RouteContext = { params: Promise<{ key: string }> };

/** PUT /api/settings/themes/[key] — Active ou programme un thème saisonnier.
 *  SUPER_ADMIN uniquement. 409 si la plage recouvre celle d'un autre thème activé. */
async function putHandler(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = (session.user.roles || ['INACTIF']) as string[];
        if (!isSuperAdmin(roles)) {
            return forbiddenResponse();
        }

        const { key } = await params;
        if (!THEME_KEYS.includes(key)) {
            return NextResponse.json({ error: 'Thème inconnu' }, { status: 404 });
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
        }

        const parsed = putSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({
                error: parsed.error.issues[0]?.message ?? 'Données invalides',
                details: parsed.error.issues,
            }, { status: 400 });
        }
        const data = parsed.data;
        const startDate = data.startDate ?? null;
        const endDate = data.endDate ?? null;

        if (data.enabled && startDate && endDate) {
            const others = await db.execute({
                sql: `SELECT theme_key, start_date, end_date FROM "SeasonalTheme"
                      WHERE enabled = 1 AND theme_key != ? AND start_date IS NOT NULL AND end_date IS NOT NULL`,
                args: [key],
            });
            const conflict = others.rows.find(row => THEME_KEYS.includes(row.theme_key as string) && rangesOverlap(
                { start: startDate, end: endDate },
                { start: row.start_date as string, end: row.end_date as string },
            ));
            if (conflict) {
                const otherKey = conflict.theme_key as string;
                const label = SEASONAL_THEMES.find(t => t.key === otherKey)?.label ?? otherKey;
                return NextResponse.json({ error: `Plage en conflit avec le thème ${label}` }, { status: 409 });
            }
        }

        const now = new Date().toISOString();
        await db.execute({
            sql: `INSERT INTO "SeasonalTheme" (theme_key, enabled, start_date, end_date, updatedAt, updatedBy)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(theme_key) DO UPDATE SET
                      enabled = excluded.enabled,
                      start_date = excluded.start_date,
                      end_date = excluded.end_date,
                      updatedAt = excluded.updatedAt,
                      updatedBy = excluded.updatedBy`,
            args: [key, data.enabled ? 1 : 0, startDate, endDate, now, session.user.email ?? null],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating seasonal theme:', error);
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du thème' }, { status: 500 });
    }
}

export const PUT = withAudit(putHandler, { action: "Modification d'un thème saisonnier", entityType: 'theme', idParam: 'key' });
