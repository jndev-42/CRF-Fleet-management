import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';
import {
    canRevealIncidentAuthor,
    isIncidentAuthor,
    isIncidentViewerBlocked,
    isWithinUlScope,
    type IncidentViewer,
} from '@/lib/incidentAccess';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const roles = session.user.roles || [];
        const viewer: IncidentViewer = {
            userId: session.user.id,
            ulId: session.user.ulId,
            roles,
        };

        if (isIncidentViewerBlocked(roles)) {
            return forbiddenResponse('Compte inactif');
        }

        // Fetch vehicle by name since [id] is the vehicle name
        const vehicleResult = await db.execute({
            sql: `SELECT id, ulId FROM Vehicle WHERE name = ?`,
            args: [id]
        });

        if (vehicleResult.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }

        const vehicleId = vehicleResult.rows[0].id;
        const vehicleUlId = (vehicleResult.rows[0].ulId as string | null) ?? null;

        // Cloisonnement UL. Le nom de véhicule n'est unique QUE dans son UL : sans ce
        // filtre, un homonyme d'une autre UL renvoyait ses incidents. 404 plutôt que
        // 403 — confirmer l'existence de l'homonyme n'apporte rien à l'appelant.
        if (!isWithinUlScope(viewer, vehicleUlId)) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }

        const isAdmin = isAdminOrAbove(roles);

        let sqlQuery = `SELECT ir.id, ir.vehicleId, ir.userId, u.name as userName, u.email as userEmail,
                         ir.tripId, ir.reservationId, ir.type, ir.status, ir.occurredAt,
                         ir.createdAt, ir.submittedAt
                  FROM IncidentReport ir
                  JOIN "User" u ON u.id = ir.userId
                  WHERE ir.vehicleId = ?`;

        const sqlArgs: (string | number)[] = [vehicleId as string];

        if (!isAdmin) {
            // Tout l'historique SOUMIS de l'UL, plus ses propres brouillons. Le
            // brouillon d'autrui n'est pas une déclaration finalisée : il reste privé.
            sqlQuery += ` AND (ir.status = 'SUBMITTED' OR ir.userId = ?)`;
            sqlArgs.push(session.user.id ?? '');
        }

        sqlQuery += ` ORDER BY ir.createdAt DESC`;

        const incidentsResult = await db.execute({
            sql: sqlQuery,
            args: sqlArgs
        });

        const incidents = incidentsResult.rows.map(row => {
            const subject = {
                authorId: String(row.userId),
                vehicleUlId,
                status: String(row.status),
            };
            const isOwn = isIncidentAuthor(viewer, subject);
            // Dépouillement à la source : les champs d'identité sont ABSENTS de la
            // réponse pour un rapport d'autrui, pas seulement masqués à l'affichage.
            const reveal = canRevealIncidentAuthor(viewer, subject);

            return {
                id: row.id,
                vehicleId: row.vehicleId,
                ...(reveal
                    ? { userId: row.userId, userName: row.userName, userEmail: row.userEmail }
                    : {}),
                isOwn,
                tripId: row.tripId,
                reservationId: row.reservationId,
                type: row.type,
                status: row.status,
                occurredAt: row.occurredAt,
                createdAt: row.createdAt,
                submittedAt: row.submittedAt,
                canEdit: isOwn || isAdmin,
            };
        });

        return NextResponse.json({ incidents });
    } catch (error) {
        console.error('Error fetching vehicle incidents:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
