import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const params = await props.params;
        const reservationId = params.id;

        // Verify that the user owns the reservation or is an ADMIN
        const checkResult = await db.execute({
            sql: `
                SELECT r.userEmail 
                FROM "Reservation" r
                WHERE r.id = ?
            `,
            args: [reservationId]
        });

        if (checkResult.rows.length === 0) {
            return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
        }

        const ownerEmail = checkResult.rows[0].userEmail as string;
        const isAdmin = session.user.roles?.includes('ADMIN');

        if (ownerEmail !== session.user.email && !isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await db.execute({
            sql: `
                DELETE FROM "Reservation"
                WHERE id = ?
            `,
            args: [reservationId]
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete reservation:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRoles: string[] = session.user.roles || [];
        if (!userRoles.includes('ADMIN') && !userRoles.includes('RESPO')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const params = await props.params;
        const reservationId = params.id;

        const checkResult = await db.execute({
            sql: `
                SELECT r.id, r.userEmail, r.vehicleId, r.startTime, r.endTime, r.status
                FROM "Reservation" r
                WHERE r.id = ?
            `,
            args: [reservationId]
        });

        if (checkResult.rows.length === 0) {
            return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
        }

        const reservation = checkResult.rows[0];

        if (reservation.status === 'VALIDATED') {
            return NextResponse.json({ error: 'Réservation déjà validée' }, { status: 409 });
        }

        // Vérifier qu'il n'y a pas de chevauchement avec les réservations validées existantes
        const conflictCheck = await db.execute({
            sql: `
                SELECT id FROM "Reservation"
                WHERE vehicleId = ?
                AND id != ?
                AND status = 'VALIDATED'
                AND (startTime < ? AND endTime > ?)
            `,
            args: [reservation.vehicleId, reservationId, reservation.endTime, reservation.startTime]
        });

        if (conflictCheck.rows.length > 0) {
            return NextResponse.json({ error: 'Ce créneau chevauche une réservation déjà validée.' }, { status: 409 });
        }

        await db.execute({
            sql: `UPDATE "Reservation" SET status = 'VALIDATED' WHERE id = ?`,
            args: [reservationId]
        });

        // Notifier le demandeur via la table Notification (cloche in-app)
        try {
            const vehicleResult = await db.execute({
                sql: `SELECT name FROM "Vehicle" WHERE id = ?`,
                args: [reservation.vehicleId as string]
            });
            const vehicleName = vehicleResult.rows[0]?.name as string || '';

            const userResult = await db.execute({
                sql: `SELECT id FROM "User" WHERE email = ?`,
                args: [reservation.userEmail as string]
            });

            if (userResult.rows.length > 0) {
                const userId = userResult.rows[0].id as string;
                const notifId = crypto.randomUUID();
                const start = new Date(reservation.startTime as string);
                const end = new Date(reservation.endTime as string);

                await db.execute({
                    sql: `INSERT INTO "Notification" (id, userId, title, message, url) VALUES (?, ?, ?, ?, ?)`,
                    args: [
                        notifId,
                        userId,
                        `✅ Réservation validée`,
                        `Votre réservation de ${vehicleName} du ${start.toLocaleDateString('fr-FR')} au ${end.toLocaleDateString('fr-FR')} a été validée.`,
                        `https://cr-chauffeur.vercel.app/vehicles/${encodeURIComponent(vehicleName)}`
                    ]
                });
            }
        } catch (notifErr) {
            console.error('Failed to send validation notification:', notifErr);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to validate reservation:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
