import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { isMaintenanceClosed } from '@/lib/maintenanceStatus';
import { recalcVehicleStatus } from '@/lib/vehicleStatusRecalc';

export const dynamic = 'force-dynamic';

const updateMaintenanceEventSchema = z.object({
  startDate: z.string().min(1, 'Date de début requise').optional(),
  endDate: z.string().nullable().optional(),
  reason: z.string().min(1, 'Raison requise').optional(),
}).refine(d => d.startDate !== undefined || d.endDate !== undefined || d.reason !== undefined,
  { message: 'Aucun champ à modifier' });

type MaintenanceEventRow = {
  id: string;
  startDate: string;
  endDate: string | null;
  reason: string;
};

type ResolveResult =
  | { error: NextResponse }
  | { vehicleId: string; event: MaintenanceEventRow };

/**
 * Séquence commune à PATCH et DELETE : 401 → 403 rôle → 404 véhicule → 403 UL →
 * 404 appartenance → 409 maintenance terminée.
 *
 * Le cloisonnement UL passe par `isOutsideUl` (`@/lib/apiAuth`) et non par une
 * comparaison `session.user.ulId !== vehicleRow.ulId` : celle-ci faisait matcher
 * deux sentinelles identiques (`ulId` vide ou `'default'`). `../route.ts`
 * (POST/PATCH de collection) applique désormais la même porte.
 */
async function resolveMaintenanceEvent(id: string, eventId: string): Promise<ResolveResult> {
  const session = await auth();
  if (!session?.user) {
    return { error: unauthorizedResponse() };
  }

  const roles = session.user.roles || ['INACTIF'];
  if (!isAdminOrAbove(roles)) {
    return { error: forbiddenResponse() };
  }

  // Résolution tolérante : le calendrier fournit un `vehicleName` potentiellement encodé.
  const decodedId = decodeURIComponent(id);
  const vehicleResult = await db.execute({
    sql: `SELECT id, ulId FROM "Vehicle" WHERE name = ? OR id = ? OR name = ?`,
    args: [id, id, decodedId],
  });

  if (vehicleResult.rows.length === 0) {
    return { error: NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 }) };
  }

  const vehicleRow = vehicleResult.rows[0];

  if (isOutsideUl(roles, session.user.ulId, vehicleRow.ulId)) {
    return { error: forbiddenResponse() };
  }

  const vehicleId = vehicleRow.id as string;

  const eventResult = await db.execute({
    sql: `SELECT id, startDate, endDate, reason FROM "VehicleMaintenance" WHERE id = ? AND vehicleId = ?`,
    args: [eventId, vehicleId],
  });

  if (eventResult.rows.length === 0) {
    return { error: NextResponse.json({ error: 'Maintenance non trouvée' }, { status: 404 }) };
  }

  const eventRow = eventResult.rows[0];
  const event: MaintenanceEventRow = {
    id: eventRow.id as string,
    startDate: eventRow.startDate as string,
    endDate: eventRow.endDate as string | null,
    reason: eventRow.reason as string,
  };

  // Garde d'état lue au moment de l'écriture : une maintenance terminée n'est plus modifiable.
  if (isMaintenanceClosed(event.endDate)) {
    return {
      error: NextResponse.json(
        { error: "Cette maintenance est terminée et n'est plus modifiable" },
        { status: 409 }
      ),
    };
  }

  return { vehicleId, event };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id, eventId } = await params;

    const resolved = await resolveMaintenanceEvent(id, eventId);
    if ('error' in resolved) {
      return resolved.error;
    }
    const { vehicleId, event } = resolved;

    const data = updateMaintenanceEventSchema.parse(await request.json());

    // Normalisation identique à `../route.ts:49-52`.
    const startDateISO = data.startDate !== undefined
      ? (data.startDate.includes('T') ? data.startDate : `${data.startDate}T00:00:00.000Z`)
      : event.startDate;
    const endDateISO = data.endDate !== undefined
      ? (data.endDate && data.endDate.trim() !== ''
        ? (data.endDate.includes('T') ? data.endDate : `${data.endDate}T23:59:59.999Z`)
        : null)
      : event.endDate;
    const reason = data.reason !== undefined ? data.reason : event.reason;

    if (endDateISO !== null && startDateISO >= endDateISO) {
      return NextResponse.json(
        { error: 'La date de fin doit être postérieure à la date de début' },
        { status: 400 }
      );
    }

    await db.execute({
      sql: `UPDATE "VehicleMaintenance" SET startDate = ?, endDate = ?, reason = ?, updatedAt = ? WHERE id = ?`,
      args: [startDateISO, endDateISO, reason, new Date().toISOString(), event.id],
    });

    // Obligatoire : décaler le `startDate` d'une maintenance en cours vers le futur la
    // désactive. Sans recalcul, `Vehicle.status` resterait 'MAINTENANCE' et
    // `api/trips/route.ts:37` refuserait l'emprunt d'un véhicule que les listes
    // présentent comme libre.
    const vehicleStatus = await recalcVehicleStatus(vehicleId);

    return NextResponse.json({
      success: true,
      maintenance: {
        id: event.id,
        vehicleId,
        startDate: startDateISO,
        endDate: endDateISO,
        reason,
      },
      vehicleStatus,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating maintenance event:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la modification de la maintenance' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id, eventId } = await params;

    const resolved = await resolveMaintenanceEvent(id, eventId);
    if ('error' in resolved) {
      return resolved.error;
    }
    const { vehicleId, event } = resolved;

    await db.execute({
      sql: `DELETE FROM "VehicleMaintenance" WHERE id = ?`,
      args: [event.id],
    });

    // Obligatoire : `POST /maintenance-events` a persisté `Vehicle.status = 'MAINTENANCE'`
    // (`../route.ts:61-66`). Sans recalcul la colonne y reste alors que `GET /api/vehicles`
    // projette 'AVAILABLE' → le tableau de bord propose l'emprunt et `trips/route.ts:37`
    // renvoie 400. Sur un véhicule `IN_USE`, `computeEffectiveStatus` retourne `IN_USE`
    // inchangé et l'UPDATE épinglé n'écrit rien.
    const vehicleStatus = await recalcVehicleStatus(vehicleId);

    return NextResponse.json({ success: true, vehicleStatus });
  } catch (error) {
    console.error('Error deleting maintenance event:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de la maintenance' },
      { status: 500 }
    );
  }
}
