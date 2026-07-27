import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

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
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
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
        const isAdmin = session.user.roles?.includes('ADMIN') || session.user.roles?.includes('SUPER_ADMIN');

        if (ownerEmail !== session.user.email && !isAdmin) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
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
