import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';

const createIncidentSchema = z.object({
    vehicleId: z.string().min(1, 'vehicleId est requis'),
    tripId: z.string().optional(),
    reservationId: z.string().optional(),
});

export async function POST(request: Request) {
    // 1. Auth
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const userId = session.user.id;
    if (!userId) {
        return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 401 });
    }

    // 2. Pas de restriction de rôle — tout utilisateur authentifié peut déclarer

    // 3. Parse & validate body
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parsed = createIncidentSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Données invalides', details: parsed.error.issues },
            { status: 400 }
        );
    }

    const { vehicleId, tripId, reservationId } = parsed.data;

    // 4. Vérifier que le véhicule existe
    const vehicleResult = await db.execute({
        sql: `SELECT id FROM Vehicle WHERE id = ?`,
        args: [vehicleId],
    });

    if (vehicleResult.rows.length === 0) {
        return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 });
    }

    // 5. Créer le rapport en statut DRAFT
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.execute({
        sql: `INSERT INTO "IncidentReport"
                (id, vehicleId, userId, tripId, reservationId, status, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
        args: [id, vehicleId, userId, tripId ?? null, reservationId ?? null, now, now],
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
}