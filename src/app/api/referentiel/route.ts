/**
 * GET /api/referentiel — état du référentiel secourisme actif.
 *
 * Tout compte actif (non INACTIF) le lit : le chatbot s'en sert pour savoir
 * s'il y a quelque chose à interroger. Le SUPER_ADMIN reçoit en plus l'éventuel
 * import en cours (`pending`), pour l'onglet d'administration.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isQrBlocked, isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { getReadyReferentiel } from '@/lib/referentiel/repository';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        const roles = session.user.roles || [];
        if (isQrBlocked(roles)) return forbiddenResponse('Compte inactif');

        const active = await getReadyReferentiel();
        const payload: Record<string, unknown> = active
            ? { ready: true, fileName: active.fileName, pageCount: active.pageCount, readyAt: active.readyAt }
            : { ready: false };

        if (isSuperAdmin(roles)) {
            const res = await db.execute(
                `SELECT id, fileName, status, pageCount, processedPages FROM Referentiel
                  WHERE status IN ('uploading', 'processing') ORDER BY createdAt DESC LIMIT 1`,
            );
            const row = res.rows[0];
            payload.pending = row
                ? {
                    id: String(row.id),
                    fileName: String(row.fileName),
                    status: String(row.status),
                    pageCount: row.pageCount == null ? null : Number(row.pageCount),
                    processedPages: Number(row.processedPages ?? 0),
                }
                : null;
        }

        return NextResponse.json(payload);
    } catch (e: unknown) {
        console.error('GET /api/referentiel error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
