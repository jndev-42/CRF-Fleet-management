/**
 * GET /api/audit-logs — journal d'audit, réservé au SUPER_ADMIN.
 *
 * Plus récentes d'abord, paginées par curseur (`before` = `createdAt` de la
 * dernière ligne reçue). Rien n'est lisible au-delà de la fenêtre de rétention,
 * même si la purge quotidienne n'est pas encore passée.
 *
 * Lecture seule : aucune route ne modifie ni ne supprime une entrée.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { AUDIT_LOG_TABLE, AUDIT_RETENTION_DAYS } from '@/lib/audit/schema';

const AUDIT_PAGE_SIZE = 50;
const MAX_LIMIT = 200;

const querySchema = z.object({
    userEmail: z.email('Adresse e-mail invalide').optional(),
    before: z.iso.datetime({ message: 'Date « before » invalide (ISO 8601 attendu)' }).optional(),
    limit: z.coerce.number('Limite invalide')
        .int('La limite doit être un entier')
        .min(1, 'La limite doit être au moins 1')
        .max(MAX_LIMIT, `La limite ne peut pas dépasser ${MAX_LIMIT}`)
        .default(AUDIT_PAGE_SIZE),
});

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (!isSuperAdmin(session.user.roles || [])) return forbiddenResponse();

        const searchParams = new URL(request.url).searchParams;
        const parsed = querySchema.safeParse({
            userEmail: searchParams.get('userEmail') || undefined,
            before: searchParams.get('before') || undefined,
            limit: searchParams.get('limit') || undefined,
        });
        if (!parsed.success) {
            return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.issues }, { status: 400 });
        }
        const { userEmail, before, limit } = parsed.data;

        const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const where = ['createdAt >= ?'];
        const args: (string | number)[] = [cutoff];
        if (userEmail) {
            // Ses actions, et celles faites « en tant que » cette personne.
            where.push('(actorEmail = ? OR impersonatedEmail = ?)');
            args.push(userEmail.toLowerCase(), userEmail.toLowerCase());
        }
        if (before) {
            where.push('createdAt < ?');
            args.push(new Date(before).toISOString());
        }
        args.push(limit);

        const res = await db.execute({
            sql: `SELECT id, createdAt, actorEmail, actorName, impersonatedEmail, ulId,
                         method, path, action, entityType, entityId, status, ip
                    FROM "${AUDIT_LOG_TABLE}"
                   WHERE ${where.join(' AND ')}
                   ORDER BY createdAt DESC, id DESC
                   LIMIT ?`,
            args,
        });

        const entries = res.rows.map(r => ({
            id: String(r.id),
            createdAt: String(r.createdAt),
            actorEmail: r.actorEmail == null ? null : String(r.actorEmail),
            actorName: r.actorName == null ? null : String(r.actorName),
            impersonatedEmail: r.impersonatedEmail == null ? null : String(r.impersonatedEmail),
            ulId: r.ulId == null ? null : String(r.ulId),
            method: String(r.method),
            path: String(r.path),
            action: String(r.action),
            entityType: r.entityType == null ? null : String(r.entityType),
            entityId: r.entityId == null ? null : String(r.entityId),
            status: Number(r.status),
            ip: r.ip == null ? null : String(r.ip),
        }));

        return NextResponse.json({
            entries,
            nextBefore: entries.length === limit ? entries[entries.length - 1].createdAt : null,
        });
    } catch (e: unknown) {
        console.error('GET /api/audit-logs error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
