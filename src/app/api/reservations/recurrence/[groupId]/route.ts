import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canManageReservations } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { isUnassignedDriverName } from '@/lib/reservationDriver';

/**
 * DELETE /api/reservations/recurrence/:groupId
 * Annule toutes les occurrences FUTURES d'un groupe de réservations récurrentes.
 * Préserve les occurrences passées (archivage).
 * Accessible par : le propriétaire de la réservation ou un ADMIN.
 */
async function deleteHandler(
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
        const canManage = canManageReservations(userRoles);

        if (ownerEmail !== session.user.email && !canManage) {
            return forbiddenResponse();
        }

        const now = new Date().toISOString();

        // Occurrences futures lues avant suppression : elles servent à notifier le demandeur
        const futureResult = await db.execute({
            sql: `
                SELECT vehicleId, userName, startTime, endTime
                FROM "Reservation"
                WHERE recurrenceGroupId = ?
                AND startTime > ?
                ORDER BY startTime ASC
            `,
            args: [groupId, now],
        });

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

        // Annulation par un tiers : le demandeur est prévenu (jamais pour « Chauffeur non décidé »)
        if (deletedCount > 0 && ownerEmail !== session.user.email
            && !isUnassignedDriverName(futureResult.rows[0]?.userName as string | undefined)) {
            try {
                const vehicleResult = await db.execute({
                    sql: `SELECT name, ulId FROM "Vehicle" WHERE id = ?`,
                    args: [futureResult.rows[0].vehicleId as string],
                });
                const vehicleName = vehicleResult.rows[0]?.name as string || '';
                const vehicleUlId = vehicleResult.rows[0]?.ulId as string || 'ul-paris-18';
                const ownerResult = await db.execute({
                    sql: `SELECT id FROM "User" WHERE email = ?`,
                    args: [ownerEmail],
                });

                if (ownerResult.rows.length > 0) {
                    const first = new Date(futureResult.rows[0].startTime as string);
                    const last = new Date(futureResult.rows[futureResult.rows.length - 1].endTime as string);
                    const { notifyUsers } = await import('@/lib/push');
                    await notifyUsers({
                        userIds: [ownerResult.rows[0].id as string],
                        title: `❌ Réservation annulée`,
                        message: `${deletedCount} occurrence(s) de votre réservation récurrente de ${vehicleName} (du ${first.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} au ${last.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}) ont été annulées.`,
                        url: `/vehicles/${encodeURIComponent(vehicleName)}`,
                        ulId: vehicleUlId,
                        excludeUserId: session.user.id,
                    });
                } else {
                    console.warn('Recurrence cancellation: requester not found for', ownerEmail);
                }
            } catch (notifErr) {
                console.error('Failed to send recurrence cancellation notification:', notifErr);
            }
        }

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
 * Seuls les rôles pouvant valider (ADMIN, CADRE, PRESIDENT) sont autorisés.
 * Les occurrences en conflit avec une réservation déjà validée sont ignorées (skip).
 */
async function patchHandler(
    request: Request,
    props: { params: Promise<{ groupId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const userRoles: string[] = session.user.roles || [];
        const canValidate = canManageReservations(userRoles);
        if (!canValidate) {
            return forbiddenResponse('Seul un responsable peut valider des réservations.');
        }

        const params = await props.params;
        const { groupId } = params;

        const now = new Date().toISOString();

        // Récupère toutes les occurrences futures en attente du groupe
        const pendingResult = await db.execute({
            sql: `
                SELECT id, vehicleId, startTime, endTime, userEmail, userName
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
        if (validated > 0 && ownerId && ownerEmail !== session.user.email
            && !isUnassignedDriverName(pendingResult.rows[0].userName as string)) {
            try {
                const { notifyUsers } = await import('@/lib/push');
                await notifyUsers({
                    userIds: [ownerId],
                    title: `✅ Réservations récurrentes validées`,
                    message: `${validated} occurrence(s) de votre réservation récurrente de ${vehicleName} ont été validées.${skipped > 0 ? ` (${skipped} créneau(x) en conflit ignoré(s))` : ''}`,
                    url: `/vehicles/${encodeURIComponent(vehicleName)}`,
                    ulId: vehicleUlId,
                    excludeUserId: session.user.id,
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

export const DELETE = withAudit(deleteHandler, { action: "Annulation d'une série de réservations", entityType: 'reservationGroup' });
export const PATCH = withAudit(patchHandler, { action: "Validation d'une série de réservations", entityType: 'reservationGroup' });
