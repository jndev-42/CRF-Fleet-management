import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { createMissionReportSchema, insertMissionReport } from '@/lib/missions/create-mission-report';

/**
 * POST /api/qr-ul/[token]/mission-report
 *
 * Dépose un compte rendu de mission rattaché à l'UL désignée par le token QR.
 *
 * AUCUN FILTRE DE RÔLE, ET C'EST TOUT L'OBJET DE CETTE ROUTE. `POST /api/missions`
 * reste réservé à `ALLOWED_ROLES` + `isAdminOrAbove` ; ici, la possession du QR
 * collé au poste fait foi, comme pour l'emprunt d'un véhicule ou l'ajustement
 * d'un stock. Un CHVL, un CHVPSP ou un bénévole sans rôle attribué doit pouvoir
 * déposer son compte rendu sur place. Seul un compte INACTIF est refusé.
 *
 * Ne pas « harmoniser » cette route avec `/api/missions` : les deux règles sont
 * opposées volontairement. Le verrou de comportement est
 * `src/__tests__/integration/qr-ul-mission-report.test.ts`.
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        if (isQrBlocked(session.user.roles || [])) {
            return forbiddenResponse('Compte inactif');
        }

        const { token } = await params;

        const ulRes = await db.execute({
            sql: `SELECT id FROM "UniteLocale" WHERE qrToken = ?`,
            args: [token],
        });
        if (ulRes.rows.length === 0) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }
        const ulId = ulRes.rows[0].id as string;

        const body = await request.json();

        // Le rattachement est dicté par le TOKEN, jamais par le client : un payload
        // portant un `selected_ul_id` d'une autre UL (ou un `selected_dt_code`)
        // déposerait sinon un rapport hors du périmètre que le QR autorise. Les deux
        // champs sont donc écrasés AVANT la validation — l'invariant « exactement
        // un des deux » du schéma partagé est ainsi toujours satisfait.
        const data = createMissionReportSchema.parse({
            ...(typeof body === 'object' && body !== null ? body : {}),
            selected_ul_id: ulId,
            selected_dt_code: null,
        });

        const result = await insertMissionReport(data, session.user.email, session.user.id);
        if (!result.ok) {
            return result.status === 401
                ? unauthorizedResponse(result.error)
                : NextResponse.json({ error: result.error }, { status: result.status });
        }

        return NextResponse.json({ success: true, id: result.id }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Error creating mission report from UL QR:', error);
        return NextResponse.json({ error: 'Erreur lors de la création du compte rendu' }, { status: 500 });
    }
}
