import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';

/** Validates incoming POST body for creating a reservation */
const createReservationSchema = z.object({
    startTime: z.string().datetime({ message: 'startTime doit être une date ISO valide' }),
    endTime: z.string().datetime({ message: 'endTime doit être une date ISO valide' }),
    reason: z.string().max(500).optional(),
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
                SELECT r.id, r.vehicleId, r.userEmail, r.userName, r.startTime, r.endTime, r.reason, r.createdAt
                FROM "Reservation" r
                WHERE r.vehicleId = ?
                ORDER BY r.startTime ASC
            `,
            args: [vehicleId]
        });

        // Convertir les objets Row en tableau typé proprement
        const reservations = result.rows.map(row => ({
            id: row.id as string,
            vehicleId: row.vehicleId as string,
            userEmail: row.userEmail as string,
            userName: row.userName as string,
            startTime: row.startTime as string,
            endTime: row.endTime as string,
            reason: row.reason as string | null,
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

        let data: { startTime: string; endTime: string; reason?: string };
        try {
            data = createReservationSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        const start = new Date(data.startTime);
        const end = new Date(data.endTime);

        // Vérification de chevauchement basique pour ce véhicule
        const conflictCheck = await db.execute({
            sql: `
                SELECT id 
                FROM "Reservation" 
                WHERE vehicleId = ? 
                AND (
                    (startTime < ? AND endTime > ?)
                )
            `,
            args: [vehicleId, end.toISOString(), start.toISOString()]
        });

        if (conflictCheck.rows.length > 0) {
            return NextResponse.json({ error: 'Ce créneau chevauche une réservation existante.' }, { status: 409 });
        }

        const id = crypto.randomUUID();

        await db.execute({
            sql: `
                INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            args: [
                id,
                vehicleId,
                session.user.email as string,
                session.user.name || session.user.email as string,
                start.toISOString(),
                end.toISOString(),
                data.reason || null
            ]
        });


        return NextResponse.json({ success: true, id }, { status: 201 });
    } catch (error) {
        console.error('Failed to create reservation:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
