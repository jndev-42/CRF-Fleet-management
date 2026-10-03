/**
 * GET /api/audit-logs — journal d'audit, réservé au SUPER_ADMIN.
 *
 * Plus récentes d'abord, paginées par numéro de page (`page`, `limit` lignes
 * par page) avec le total pour afficher « Page X sur Y ». Rien n'est lisible
 * au-delà de la fenêtre de rétention, même si la purge quotidienne n'est pas
 * encore passée. `asOf` fige la liste : la réponse renvoie l'instant retenu,
 * que le client repasse pour les pages suivantes — les événements arrivés entre
 * deux pages ne font donc pas glisser les lignes.
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

const AUDIT_PAGE_SIZE = 10;
const MAX_LIMIT = 200;
const MAX_PAGE = 100_000;

const querySchema = z.object({
    userEmail: z.email('Adresse e-mail invalide').optional(),
    page: z.coerce.number('Page invalide')
        .int('La page doit être un entier')
        .min(1, 'La page doit être au moins 1')
        .max(MAX_PAGE, `La page ne peut pas dépasser ${MAX_PAGE}`)
        .default(1),
    asOf: z.iso.datetime({ message: 'Date « asOf » invalide (ISO 8601 attendu)' }).optional(),
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
            page: searchParams.get('page') || undefined,
            asOf: searchParams.get('asOf') || undefined,
            limit: searchParams.get('limit') || undefined,
        });
        if (!parsed.success) {
            return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.issues }, { status: 400 });
        }
        const { userEmail, page, limit } = parsed.data;
        const asOf = parsed.data.asOf ? new Date(parsed.data.asOf).toISOString() : new Date().toISOString();

        const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const where = ['createdAt >= ?', 'createdAt <= ?'];
        const args: (string | number)[] = [cutoff, asOf];
        if (userEmail) {
            // Ses actions, et celles faites « en tant que » cette personne.
            where.push('(actorEmail = ? OR impersonatedEmail = ?)');
            args.push(userEmail.toLowerCase(), userEmail.toLowerCase());
        }

        const [countRes, res] = await Promise.all([
            db.execute({
                sql: `SELECT COUNT(*) AS total FROM "${AUDIT_LOG_TABLE}" WHERE ${where.join(' AND ')}`,
                args,
            }),
            db.execute({
                sql: `SELECT id, createdAt, actorEmail, actorName, impersonatedEmail, ulId,
                             method, path, action, entityType, entityId, status, ip
                        FROM "${AUDIT_LOG_TABLE}"
                       WHERE ${where.join(' AND ')}
                       ORDER BY createdAt DESC, id DESC
                       LIMIT ? OFFSET ?`,
                args: [...args, limit, (page - 1) * limit],
            }),
        ]);
        const total = Number(countRes.rows[0]?.total ?? 0);

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
            page,
            pageSize: limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            asOf,
        });
    } catch (e: unknown) {
        console.error('GET /api/audit-logs error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
