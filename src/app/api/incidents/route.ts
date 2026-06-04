import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import crypto from 'crypto';

const incidentSchema = z.object({
    vehicleId: z.string().min(1),
    tripId: z.string().optional().nullable(),
    reservationId: z.string().optional().nullable(),
    type: z.enum(['ACCIDENT', 'FLASH']).optional().nullable(),
    status: z.enum(['DRAFT', 'SUBMITTED']).optional(),
    occurredAt: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    flashDetails: z.record(z.string(), z.any()).optional().nullable(),
    accidentDetails: z.record(z.string(), z.any()).optional().nullable(),
    damages: z.record(z.string(), z.any()).optional().nullable(),
    victims: z.record(z.string(), z.any()).optional().nullable(),
    actions: z.record(z.string(), z.any()).optional().nullable(),
    context: z.record(z.string(), z.any()).optional().nullable(),
    description: z.string().optional().nullable(),
    retrospection: z.string().optional().nullable(),
    driveFolderId: z.string().optional().nullable(),
});

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const parsed = incidentSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 });
        }

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const data = parsed.data;

        await db.execute({
            sql: `INSERT INTO "IncidentReport" (
                id, vehicleId, userId, tripId, reservationId, type, status,
                occurredAt, location, flashDetails, accidentDetails,
                damages, victims, actions, context, description, retrospection,
                driveFolderId, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                id,
                data.vehicleId,
                session.user.id,
                data.tripId || null,
                data.reservationId || null,
                data.type || null,
                data.status || 'DRAFT',
                data.occurredAt || null,
                data.location || null,
                data.flashDetails ? JSON.stringify(data.flashDetails) : null,
                data.accidentDetails ? JSON.stringify(data.accidentDetails) : null,
                data.damages ? JSON.stringify(data.damages) : null,
                data.victims ? JSON.stringify(data.victims) : null,
                data.actions ? JSON.stringify(data.actions) : null,
                data.context ? JSON.stringify(data.context) : null,
                data.description || null,
                data.retrospection || null,
                data.driveFolderId || null,
                now,
                now
            ],
        });

        return NextResponse.json({ success: true, id }, { status: 201 });
    } catch (error) {
        console.error('[POST /api/incidents]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
