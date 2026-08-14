import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canAccessAdminPanel } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

/**
 * DELETE /api/reservations/recurrence/:groupId
 * Annule toutes les occurrences FUTURES d'un groupe de réservations récurrentes.
 * Préserve les occurrences passées (archivage).
 * Accessible par : le propriétaire de la réservation ou un ADMIN.
 */
export async function DELETE(
    request: Request,
    props: { params: Promise<{ groupId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const params = await props.params;
        const { groupId } = params;

        // Vérification : l'utilisateur possède au moins une réservation dans ce groupe
        const checkResult = await db.execute({
            sql: `
                SELECT DISTINCT userEmail
                FROM "Reservation"
                WHERE recurrenceGroupId = ?
                LIMIT 1
            `,
            args: [groupId],
        });

        if (checkResult.rows.length === 0) {
            return NextResponse.json({ error: 'Groupe de récurrence introuvable' }, { status: 404 });
        }

        const ownerEmail = checkResult.rows[0].userEmail as string;
        const userRoles: string[] = session.user.roles || [];
        const canManage = canAccessAdminPanel(userRoles) || userRoles.includes('RESPO');

        if (ownerEmail !== session.user.email && !canManage) {
            return forbiddenResponse();
        }

        const now = new Date().toISOString();

        // Supprime uniquement les occurrences futures (startTime > maintenant)
        const deleteResult = await db.execute({
            sql: `
                DELETE FROM "Reservation"
                WHERE recurrenceGroupId = ?
                AND startTime > ?
            `,
            args: [groupId, now],
        });

        const deletedCount = deleteResult.rowsAffected ?? 0;

        return NextResponse.json({
            success: true,
            deleted: deletedCount,
            message: `${deletedCount} occurrence(s) annulée(s).`,
        });
    } catch (error) {
        console.error('Failed to delete recurrence group:', error);
        return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
    }
}

/**
 * PATCH /api/reservations/recurrence/:groupId
 * Valide toutes les occurrences FUTURES en attente d'un groupe de réservations récurrentes.
 * Seuls les rôles pouvant valider (ADMIN, RESPO, CADRE, PRESIDENT) sont autorisés.
 * Les occurrences en conflit avec une réservation déjà validée sont ignorées (skip).
 */
export async function PATCH(
    request: Request,
    props: { params: Promise<{ groupId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const userRoles: string[] = session.user.roles || [];
        const canValidate = canAccessAdminPanel(userRoles) || userRoles.includes('RESPO');
        if (!canValidate) {
            return forbiddenResponse('Seul un responsable peut valider des réservations.');
        }

        const params = await props.params;
        const { groupId } = params;

        const now = new Date().toISOString();

        // Récupère toutes les occurrences futures en attente du groupe
        const pendingResult = await db.execute({
            sql: `
                SELECT id, vehicleId, startTime, endTime, userEmail
                FROM "Reservation"
                WHERE recurrenceGroupId = ?
                AND status = 'PENDING'
                AND startTime > ?
                ORDER BY startTime ASC
            `,
            args: [groupId, now],
        });

        if (pendingResult.rows.length === 0) {
            return NextResponse.json({
                success: true,
                validated: 0,
                skipped: 0,
                message: 'Aucune occurrence en attente à valider.',
            });
        }

        // Récupère les infos véhicule une seule fois (même vehicleId pour tout le groupe)
        const vehicleId = pendingResult.rows[0].vehicleId as string;
        const vehicleResult = await db.execute({
            sql: `SELECT name, ulId FROM "Vehicle" WHERE id = ?`,
            args: [vehicleId],
        });
        const vehicleName = vehicleResult.rows[0]?.name as string || vehicleId;
        const vehicleUlId = vehicleResult.rows[0]?.ulId as string || 'ul-paris-18';

        // Récupère l'userId du demandeur pour la notification (premier userEmail du groupe)
        const ownerEmail = pendingResult.rows[0].userEmail as string;
        const ownerResult = await db.execute({
            sql: `SELECT id FROM "User" WHERE email = ?`,
            args: [ownerEmail],
        });
        const ownerId = ownerResult.rows.length > 0 ? ownerResult.rows[0].id as string : null;

        let validated = 0;
        let skipped = 0;
        const skippedDates: string[] = [];

        for (const row of pendingResult.rows) {
            const reservationId = row.id as string;
            const startTime = row.startTime as string;
            const endTime = row.endTime as string;

            // Vérification de conflit avec les réservations déjà validées
            const conflictCheck = await db.execute({
                sql: `
                    SELECT id FROM "Reservation"
                    WHERE vehicleId = ?
                    AND id != ?
                    AND status = 'VALIDATED'
                    AND (startTime < ? AND endTime > ?)
                `,
                args: [vehicleId, reservationId, endTime, startTime],
            });

            if (conflictCheck.rows.length > 0) {
                skipped++;
                skippedDates.push(new Date(startTime).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }));
                continue;
            }

            await db.execute({
                sql: `UPDATE "Reservation" SET status = 'VALIDATED' WHERE id = ?`,
                args: [reservationId],
            });
            validated++;
        }

        // Notification groupée au demandeur (une seule notif pour tout le groupe)
        if (validated > 0 && ownerId) {
            try {
                const notifId = crypto.randomUUID();
                await db.execute({
                    sql: `INSERT INTO "Notification" (id, userId, title, message, url, ulId) VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [
                        notifId,
                        ownerId,
                        `✅ Réservations récurrentes validées`,
                        `${validated} occurrence(s) de votre réservation récurrente de ${vehicleName} ont été validées.${skipped > 0 ? ` (${skipped} créneau(x) en conflit ignoré(s))` : ''}`,
                        `https://cr-chauffeur.vercel.app/vehicles/${encodeURIComponent(vehicleName)}`,
                        vehicleUlId,
                    ],
                });
            } catch (notifErr) {
                console.error('Failed to send group validation notification:', notifErr);
            }
        }

        return NextResponse.json({
            success: true,
            validated,
            skipped,
            skippedDates,
            message: `${validated} occurrence(s) validée(s)${skipped > 0 ? `, ${skipped} ignorée(s) (conflit)` : ''}.`,
        });
    } catch (error) {
        console.error('Failed to validate recurrence group:', error);
        return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
    }
}
