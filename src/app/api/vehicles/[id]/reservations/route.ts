import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canAccessAdminPanel, isAdminOrAbove } from '@/lib/roles';

/** Validates incoming POST body for creating a reservation */
const createReservationSchema = z.object({
    startTime: z.string().datetime({ message: 'startTime doit être une date ISO valide' }),
    endTime: z.string().datetime({ message: 'endTime doit être une date ISO valide' }),
    reason: z.string().max(500).optional(),
    ch: z.string().max(200).optional(),
    onBehalfOfUserId: z.string().min(1).optional(),
}).refine(data => new Date(data.endTime) > new Date(data.startTime), {
    message: 'endTime doit être après startTime',
    path: ['endTime'],
}).refine(data => new Date(data.startTime) > new Date(), {
    message: 'La réservation ne peut pas être dans le passé',
    path: ['startTime'],
});

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const params = await props.params;
        const vehicleId = params.id;

        const result = await db.execute({
            sql: `
                SELECT r.id, r.vehicleId, r.userEmail, r.userName, r.startTime, r.endTime, r.reason, r.ch, r.status, r.createdAt
                FROM "Reservation" r
                WHERE r.vehicleId = ?
                ORDER BY r.startTime ASC
            `,
            args: [vehicleId]
        });

        const reservations = result.rows.map(row => ({
            id: row.id as string,
            vehicleId: row.vehicleId as string,
            userEmail: row.userEmail as string,
            userName: row.userName as string,
            startTime: row.startTime as string,
            endTime: row.endTime as string,
            reason: row.reason as string | null,
            ch: (row.ch as string) || 'CH non décidé',
            status: (row.status as string) || 'PENDING',
            createdAt: row.createdAt as string
        }));

        return NextResponse.json(reservations);
    } catch (error) {
        console.error('Failed to fetch reservations:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const params = await props.params;
        const vehicleId = params.id;
        const body = await request.json();

        let data: z.infer<typeof createReservationSchema>;
        try {
            data = createReservationSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        // ADMIN et RESPO voient leurs réservations auto-validées
        const userRoles: string[] = session.user.roles || [];
        const isValidator = canAccessAdminPanel(userRoles);
        const status = isValidator ? 'VALIDATED' : 'PENDING';

        if (data.onBehalfOfUserId && !isAdminOrAbove(userRoles)) {
            return NextResponse.json({ error: 'Seul un ADMIN peut créer une réservation pour quelqu\'un d\'autre.' }, { status: 403 });
        }

        const start = new Date(data.startTime);
        const end = new Date(data.endTime);

        // Vérification de chevauchement : une seule requête pour VALIDATED et PENDING
        const conflicts = await db.execute({
            sql: `
                SELECT id, status
                FROM "Reservation"
                WHERE vehicleId = ?
                AND status IN ('VALIDATED', 'PENDING')
                AND (startTime < ? AND endTime > ?)
            `,
            args: [vehicleId, end.toISOString(), start.toISOString()]
        });

        const hasValidated = conflicts.rows.some(r => r.status === 'VALIDATED');
        const hasPending   = conflicts.rows.some(r => r.status === 'PENDING');

        // Tout le monde est bloqué par une réservation VALIDÉE
        if (hasValidated) {
            return NextResponse.json({ error: 'Ce créneau chevauche une réservation déjà validée.' }, { status: 409 });
        }
        // Tout le monde est bloqué par une réservation EN ATTENTE
        if (hasPending) {
            return NextResponse.json({ error: 'Ce créneau chevauche une demande de réservation déjà en attente.' }, { status: 409 });
        }

        let userEmail = session.user.email as string;
        let userName = session.user.name || session.user.email as string;

        if (data.onBehalfOfUserId) {
            const targetResult = await db.execute({
                sql: `SELECT id, name, email FROM "User" WHERE id = ?`,
                args: [data.onBehalfOfUserId]
            });
            if (targetResult.rows.length === 0) {
                return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });
            }
            userEmail = targetResult.rows[0].email as string;
            userName = (targetResult.rows[0].name as string) || userEmail;
        }

        const id = crypto.randomUUID();
        const chValue = data.ch && data.ch.trim() !== '' ? data.ch.trim() : 'CH non décidé';

        await db.execute({
            sql: `
                INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, reason, ch, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            args: [
                id,
                vehicleId,
                userEmail,
                userName,
                start.toISOString(),
                end.toISOString(),
                data.reason || null,
                chValue,
                status
            ]
        });

        // Si la réservation est en attente, notifier les ADMIN et RESPO
        if (status === 'PENDING') {
            try {
                const vehicleResult = await db.execute({
                    sql: `SELECT name, ulId FROM "Vehicle" WHERE id = ?`,
                    args: [vehicleId]
                });
                const vehicleName = vehicleResult.rows[0]?.name as string || vehicleId;
                const vehicleUlId = vehicleResult.rows[0]?.ulId as string || 'ul-paris-18';
                const requesterName = session.user.name || session.user.email;

                const { sendPushNotification } = await import('@/lib/onesignal');

                // Notifier les ADMIN
                await sendPushNotification({
                    tags: [{ field: "tag", key: "role_ADMIN", relation: "=", value: "true" }],
                    headings: { fr: `📋 Nouvelle demande de réservation`, en: `📋 New reservation request` },
                    contents: {
                        fr: `${requesterName} demande ${vehicleName} du ${start.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} au ${end.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. En attente de validation.`,
                        en: `${requesterName} requests ${vehicleName} from ${start.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} to ${end.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. Pending validation.`
                    },
                    url: `https://cr-chauffeur.vercel.app/vehicles/${vehicleName}`,
                    ulId: vehicleUlId
                });

                // Notifier les RESPO
                await sendPushNotification({
                    tags: [{ field: "tag", key: "role_RESPO", relation: "=", value: "true" }],
                    headings: { fr: `📋 Nouvelle demande de réservation`, en: `📋 New reservation request` },
                    contents: {
                        fr: `${requesterName} demande ${vehicleName} du ${start.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} au ${end.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. En attente de validation.`,
                        en: `${requesterName} requests ${vehicleName} from ${start.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} to ${end.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. Pending validation.`
                    },
                    url: `https://cr-chauffeur.vercel.app/vehicles/${vehicleName}`,
                    ulId: vehicleUlId
                });
            } catch (notifErr) {
                console.error('Failed to send reservation notification:', notifErr);
            }
        }

        return NextResponse.json({ success: true, id, status }, { status: 201 });
    } catch (error) {
        console.error('Failed to create reservation:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
