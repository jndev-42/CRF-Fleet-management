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

    const endDateValue = data.endDate && data.endDate.trim() !== '' ? data.endDate : null;
    const todayDate = new Date().toISOString().split('T')[0];

    await db.execute({
      sql: `INSERT INTO "VehicleMaintenance" (id, vehicleId, startDate, endDate, reason, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [eventId, vehicleId, data.startDate, endDateValue, data.reason, now, now],
    });

    // Only update vehicle status to MAINTENANCE immediately if start date is today or in the past
    if (data.startDate <= todayDate) {
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
          startDate: data.startDate,
          endDate: endDateValue,
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
    console.error('Error creating maintenance event:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création de la maintenance' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const roles = session.user.roles || ['INACTIF'];
    if (!isAdminOrAbove(roles)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
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
    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Close all active/ongoing maintenance records for this vehicle (set endDate to yesterday's date so endDate >= todayDate is false)
    await db.execute({
      sql: `UPDATE "VehicleMaintenance" SET endDate = ?, updatedAt = ? WHERE vehicleId = ? AND (endDate IS NULL OR endDate >= ?)`,
      args: [yesterdayDate, nowISO, vehicleId, yesterdayDate],
    });

    await db.execute({
      sql: `UPDATE "Vehicle" SET status = 'AVAILABLE', updatedAt = ? WHERE id = ?`,
      args: [nowISO, vehicleId],
    });

    return NextResponse.json({ success: true, endDate: yesterdayDate });
  } catch (error) {
    console.error('Error ending vehicle maintenance:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la remise en service' },
      { status: 500 }
    );
  }
}
