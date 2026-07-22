import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const createMaintenanceEventSchema = z.object({
  startDate: z.string().min(1, 'Date de début requise'),
  endDate: z.string().nullable().optional(),
  reason: z.string().min(1, 'Raison requise'),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const roles = session.user.roles || ['INACTIF'];
    if (!isAdminOrAbove(roles)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = createMaintenanceEventSchema.parse(body);

    const decodedId = decodeURIComponent(id);
    const vehicleResult = await db.execute({
      sql: `SELECT id FROM "Vehicle" WHERE name = ? OR id = ? OR name = ?`,
      args: [id, id, decodedId],
    });

    if (vehicleResult.rows.length === 0) {
      return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
    }

    const vehicleId = vehicleResult.rows[0].id as string;
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();

    const startDateISO = data.startDate.includes('T') ? data.startDate : `${data.startDate}T00:00:00.000Z`;
    const endDateISO = data.endDate && data.endDate.trim() !== ''
      ? (data.endDate.includes('T') ? data.endDate : `${data.endDate}T23:59:59.999Z`)
      : null;

    await db.execute({
      sql: `INSERT INTO "VehicleMaintenance" (id, vehicleId, startDate, endDate, reason, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [eventId, vehicleId, startDateISO, endDateISO, data.reason, now, now],
    });

    // Only update vehicle status to MAINTENANCE immediately if start date is today or in the past
    if (startDateISO <= now) {
      await db.execute({
        sql: `UPDATE "Vehicle" SET status = 'MAINTENANCE', updatedAt = ? WHERE id = ?`,
        args: [now, vehicleId],
      });
    }

    return NextResponse.json(
      {
        success: true,
        maintenance: {
          id: eventId,
          vehicleId,
          startDate: startDateISO,
          endDate: endDateISO,
          reason: data.reason,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error starting vehicle maintenance:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la mise en maintenance' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const roles = session.user.roles || ['INACTIF'];
    if (!isAdminOrAbove(roles)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    const decodedId = decodeURIComponent(id);
    const vehicleResult = await db.execute({
      sql: `SELECT id FROM "Vehicle" WHERE name = ? OR id = ? OR name = ?`,
      args: [id, id, decodedId],
    });

    if (vehicleResult.rows.length === 0) {
      return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
    }

    const vehicleId = vehicleResult.rows[0].id as string;
    const nowISO = new Date().toISOString();
    const endTimestamp = new Date(Date.now() - 1000).toISOString();
    const todayDate = nowISO.split('T')[0];

    // Close all active/ongoing maintenance records for this vehicle
    await db.execute({
      sql: `UPDATE "VehicleMaintenance" SET endDate = ?, updatedAt = ? WHERE vehicleId = ? AND (endDate IS NULL OR endDate >= ? OR endDate > ?)`,
      args: [endTimestamp, nowISO, vehicleId, todayDate, endTimestamp],
    });

    await db.execute({
      sql: `UPDATE "Vehicle" SET status = 'AVAILABLE', updatedAt = ? WHERE id = ?`,
      args: [nowISO, vehicleId],
    });

    return NextResponse.json({ success: true, endDate: endTimestamp });
  } catch (error) {
    console.error('Error ending vehicle maintenance:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la remise en service' },
      { status: 500 }
    );
  }
}
