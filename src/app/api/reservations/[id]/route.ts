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

import { z } from 'zod';

const updateReservationSchema = z.object({
    startTime: z.string().datetime({ message: 'startTime doit être une date ISO valide' }).optional(),
    endTime: z.string().datetime({ message: 'endTime doit être une date ISO valide' }).optional(),
    reason: z.string().max(500).optional().nullable(),
    ch: z.string().max(200).optional().nullable(),
    action: z.enum(['validate', 'update']).optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const params = await props.params;
        const reservationId = params.id;

        const checkResult = await db.execute({
            sql: `
                SELECT r.id, r.userEmail, r.vehicleId, r.startTime, r.endTime, r.reason, r.ch, r.status
                FROM "Reservation" r
                WHERE r.id = ?
            `,
            args: [reservationId]
        });

        if (checkResult.rows.length === 0) {
            return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
        }

        const reservation = checkResult.rows[0];
        const userRoles: string[] = session.user.roles || [];
        const isOwner = session.user.email === reservation.userEmail;
        const isAdminOrRespo = userRoles.includes('ADMIN') || userRoles.includes('RESPO');

        let body: Record<string, unknown> = {};
        try {
            const text = await request.text();
            if (text && text.trim() !== '') {
                body = JSON.parse(text);
            }
        } catch {
            // body remain empty object
        }

        // If body has edit fields (startTime, endTime, reason, ch) or action === 'update'
        const hasEditFields = body.startTime !== undefined || body.endTime !== undefined || body.reason !== undefined || body.ch !== undefined || body.action === 'update';

        if (hasEditFields) {
            // Check editing permissions: owner or ADMIN/RESPO
            if (!isOwner && !isAdminOrRespo) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }

            let parsed: z.infer<typeof updateReservationSchema>;
            try {
                parsed = updateReservationSchema.parse(body);
            } catch (zodErr) {
                if (zodErr instanceof z.ZodError) {
                    return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
                }
                throw zodErr;
            }

            const newStartStr = parsed.startTime || (reservation.startTime as string);
            const newEndStr = parsed.endTime || (reservation.endTime as string);

            const newStart = new Date(newStartStr);
            const newEnd = new Date(newEndStr);

            if (newEnd <= newStart) {
                return NextResponse.json({ error: 'endTime doit être après startTime' }, { status: 400 });
            }

            // Check overlap with other reservations for the same vehicle
            const conflictCheck = await db.execute({
                sql: `
                    SELECT id, status FROM "Reservation"
                    WHERE vehicleId = ?
                    AND id != ?
                    AND status IN ('VALIDATED', 'PENDING')
                    AND (startTime < ? AND endTime > ?)
                `,
                args: [reservation.vehicleId, reservationId, newEnd.toISOString(), newStart.toISOString()]
            });

            if (conflictCheck.rows.length > 0) {
                const hasValidated = conflictCheck.rows.some(r => r.status === 'VALIDATED');
                const msg = hasValidated
                    ? 'Ce créneau chevauche une réservation déjà validée.'
                    : 'Ce créneau chevauche une demande de réservation déjà en attente.';
                return NextResponse.json({ error: msg }, { status: 409 });
            }

            const newReason = parsed.reason !== undefined ? parsed.reason : reservation.reason;
            const newCh = parsed.ch !== undefined ? (parsed.ch && parsed.ch.trim() !== '' ? parsed.ch.trim() : 'CH non décidé') : (reservation.ch || 'CH non décidé');

            await db.execute({
                sql: `
                    UPDATE "Reservation"
                    SET startTime = ?, endTime = ?, reason = ?, ch = ?
                    WHERE id = ?
                `,
                args: [newStart.toISOString(), newEnd.toISOString(), newReason || null, newCh, reservationId]
            });

            return NextResponse.json({ success: true });
        } else {
            // Action is Validation (legacy or action === 'validate')
            if (!isAdminOrRespo) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }

            if (reservation.status === 'VALIDATED') {
                return NextResponse.json({ error: 'Réservation déjà validée' }, { status: 409 });
            }

            // Check overlap with validated reservations
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

            // Notifier le demandeur via la table Notification
            try {
                const vehicleResult = await db.execute({
                    sql: `SELECT name, ulId FROM "Vehicle" WHERE id = ?`,
                    args: [reservation.vehicleId as string]
                });
                const vehicleName = vehicleResult.rows[0]?.name as string || '';
                const vehicleUlId = vehicleResult.rows[0]?.ulId as string || 'ul-paris-18';

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
                        sql: `INSERT INTO "Notification" (id, userId, title, message, url, ulId) VALUES (?, ?, ?, ?, ?, ?)`,
                        args: [
                            notifId,
                            userId,
                            `✅ Réservation validée`,
                            `Votre réservation de ${vehicleName} du ${start.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} au ${end.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} a été validée.`,
                            `https://cr-chauffeur.vercel.app/vehicles/${encodeURIComponent(vehicleName)}`,
                            vehicleUlId
                        ]
                    });
                }
            } catch (notifErr) {
                console.error('Failed to send validation notification:', notifErr);
            }

            return NextResponse.json({ success: true });
        }
    } catch (error) {
        console.error('Failed to update reservation:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
    return PATCH(request, props);
}

