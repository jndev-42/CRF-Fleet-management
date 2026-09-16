import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove, isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

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
      return unauthorizedResponse();
    }

    const roles = session.user.roles || ['INACTIF'];
    if (!isAdminOrAbove(roles)) {
      return forbiddenResponse();
    }

    const { id } = await params;
    const body = await request.json();
    const data = createMaintenanceEventSchema.parse(body);

    const decodedId = decodeURIComponent(id);
    const vehicleResult = await db.execute({
      sql: `SELECT id, ulId FROM "Vehicle" WHERE name = ? OR id = ? OR name = ?`,
      args: [id, id, decodedId],
    });

    if (vehicleResult.rows.length === 0) {
      return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
    }

    const vehicleRow = vehicleResult.rows[0];

    // Cloisonnement UL : `isAdminOrAbove` seul laissait un ADMIN d'une autre UL
    // immobiliser un véhicule étranger via la résolution tolérante par nom.
    if (!isSuperAdmin(roles) && session.user.ulId !== vehicleRow.ulId) {
      return forbiddenResponse();
    }

    const vehicleId = vehicleRow.id as string;
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

    // Only update vehicle status to MAINTENANCE immediately if start date is today or in the past.
    // Clause `AND status != 'IN_USE'` : un véhicule physiquement dehors ne doit jamais être
    // déclaré rentré par une mise en maintenance — le read-repair de
    // `api/vehicles/[id]/route.ts:110` ne saurait pas le défaire, et le CTA de restitution
    // du header (gaté sur `status === 'IN_USE'`) disparaîtrait.
    if (startDateISO <= now) {
      await db.execute({
        sql: `UPDATE "Vehicle" SET status = 'MAINTENANCE', updatedAt = ? WHERE id = ? AND status != 'IN_USE'`,
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
      return unauthorizedResponse();
    }

    const roles = session.user.roles || ['INACTIF'];
    if (!isAdminOrAbove(roles)) {
      return forbiddenResponse();
    }

    const { id } = await params;
    const decodedId = decodeURIComponent(id);

    const vehicleResult = await db.execute({
      sql: `SELECT id, ulId FROM "Vehicle" WHERE name = ? OR id = ? OR name = ?`,
      args: [id, id, decodedId],
    });

    if (vehicleResult.rows.length === 0) {
      return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
    }

    const vehicleRow = vehicleResult.rows[0];

    // Cloisonnement UL : sans cette garde, un ADMIN d'une autre UL clôturait toutes les
    // maintenances actives d'un véhicule étranger et le repassait 'AVAILABLE'.
    if (!isSuperAdmin(roles) && session.user.ulId !== vehicleRow.ulId) {
      return forbiddenResponse();
    }

    const vehicleId = vehicleRow.id as string;
    const nowISO = new Date().toISOString();
    const endTimestamp = new Date(Date.now() - 1000).toISOString();
    const todayDate = nowISO.split('T')[0];

    // Close all active/ongoing maintenance records for this vehicle
    await db.execute({
      sql: `UPDATE "VehicleMaintenance" SET endDate = ?, updatedAt = ? WHERE vehicleId = ? AND (endDate IS NULL OR endDate >= ? OR endDate > ?)`,
      args: [endTimestamp, nowISO, vehicleId, todayDate, endTimestamp],
    });

    // Clause `AND status != 'IN_USE'` : ceinture-bretelles serveur du masquage de
    // « Remettre en service » tant qu'un trajet est ouvert. Sans elle, un ADMIN sortirait
    // d'un clic un véhicule dehors de l'état `IN_USE`, autorisant via `trips/route.ts:37`
    // un second check-out concurrent.
    await db.execute({
      sql: `UPDATE "Vehicle" SET status = 'AVAILABLE', updatedAt = ? WHERE id = ? AND status != 'IN_USE'`,
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
