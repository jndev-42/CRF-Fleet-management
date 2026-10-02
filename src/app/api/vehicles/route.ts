import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';
import { computeEffectiveStatus } from '@/lib/vehicleStatusRecalc';
import { withAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const createVehicleSchema = z.object({
    name: z.string().min(1, "Nom requis"),
    type: z.string().min(1, "Type requis"),
    plate: z.string().min(1, "Plaque requise"),
    parkingSpot: z.string().optional().nullable(),
    fuelLevel: z.number().min(0).max(100),
    mileage: z.number().min(0),
    hasDSA: z.boolean().default(false),
    desinfTracking: z.boolean().default(false),
    notes: z.string().optional().nullable(),
    fuelType: z.string().optional().nullable(),
    transmission: z.enum(['Manuelle', 'Automatique']).optional().nullable(),
    maxFuelCapacity: z.number().int().min(1).optional().nullable(),
    maxBatteryCapacityKwh: z.number().int().min(1).optional().nullable(),
    firstRegistrationDate: z.string().optional().nullable(),
    revisionKmInterval: z.number().int().positive().optional().nullable(),
    revisionYearInterval: z.number().int().positive().optional().nullable(),
});

import { hasDTRole } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import {
    computeVehicleAvailability,
    parseDtWindow,
    type DtMaintenance,
    type DtReservation,
    type DtWindow,
} from '@/lib/dtAvailability';

/**
 * Ajoute `availability` à chaque véhicule de la DT, calculée sur la fenêtre demandée.
 * Deux requêtes groupées sur toute la DT (réservations, maintenances) ; le trajet ouvert
 * vient déjà de la jointure principale (`t.checkInAt IS NULL`).
 */
async function attachDtAvailability(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- même Map non typée que le GET (forme Prisma historique)
    vehiclesMap: Map<string, any>,
    rows: Array<Record<string, unknown>>,
    dtCode: string,
    window: DtWindow,
    now: Date,
) {
    const startISO = window.start.toISOString();
    const endISO = window.end.toISOString();
    const dtVehicles = `v.ulId IN (SELECT id FROM "UniteLocale" WHERE dtCode = ?)`;

    // Préfiltre large (bornes incluses) ; le chevauchement exact est tranché par
    // `computeVehicleAvailability`.
    const [resResult, maintResult] = await Promise.all([
        db.execute({
            sql: `SELECT r.id, r.vehicleId, r.userName, r.startTime, r.endTime, r.reason, r.status
                  FROM "Reservation" r
                  JOIN Vehicle v ON v.id = r.vehicleId
                  WHERE ${dtVehicles}
                    AND r.status IN ('PENDING', 'VALIDATED')
                    AND r.startTime <= ? AND r.endTime >= ?`,
            args: [dtCode, endISO, startISO],
        }),
        // Même comparaison « jour vs ISO » que la jointure de maintenance du GET.
        db.execute({
            sql: `SELECT m.vehicleId, m.startDate, m.endDate
                  FROM VehicleMaintenance m
                  JOIN Vehicle v ON v.id = m.vehicleId
                  WHERE ${dtVehicles}
                    AND (
                      (m.startDate LIKE '%T%' AND m.startDate <= ?) OR
                      (m.startDate NOT LIKE '%T%' AND m.startDate <= ?)
                    )
                    AND (
                      m.endDate IS NULL OR
                      (m.endDate LIKE '%T%' AND m.endDate >= ?) OR
                      (m.endDate NOT LIKE '%T%' AND m.endDate >= ?)
                    )`,
            args: [dtCode, endISO, endISO.split('T')[0], startISO, startISO.split('T')[0]],
        }),
    ]);

    const reservationsByVehicle = new Map<string, DtReservation[]>();
    for (const row of resResult.rows) {
        const list = reservationsByVehicle.get(row.vehicleId as string) ?? [];
        list.push({
            id: row.id as string,
            startTime: row.startTime as string,
            endTime: row.endTime as string,
            userName: row.userName as string,
            status: row.status as DtReservation['status'],
            reason: (row.reason as string | null) ?? null,
        });
        reservationsByVehicle.set(row.vehicleId as string, list);
    }

    const maintenancesByVehicle = new Map<string, DtMaintenance[]>();
    for (const row of maintResult.rows) {
        const list = maintenancesByVehicle.get(row.vehicleId as string) ?? [];
        list.push({ startDate: row.startDate as string, endDate: (row.endDate as string | null) ?? null });
        maintenancesByVehicle.set(row.vehicleId as string, list);
    }

    const openTripByVehicle = new Map<string, string>();
    for (const row of rows) {
        if (row.trip_id && row.trip_checkOutAt) {
            const checkOutAt = new Date(row.trip_checkOutAt as string);
            openTripByVehicle.set(
                row.id as string,
                Number.isNaN(checkOutAt.getTime()) ? String(row.trip_checkOutAt) : checkOutAt.toISOString(),
            );
        }
    }

    for (const [vehicleId, vehicle] of vehiclesMap) {
        const checkOutAt = openTripByVehicle.get(vehicleId);
        vehicle.availability = computeVehicleAvailability({
            reservations: reservationsByVehicle.get(vehicleId) ?? [],
            maintenances: maintenancesByVehicle.get(vehicleId) ?? [],
            openTrip: checkOutAt ? { checkOutAt } : null,
            windowStart: window.start,
            windowEnd: window.end,
            now,
        });
    }
}

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const ulId = session.user.ulId;

        // Un utilisateur sans UL ne voit aucun véhicule
        if (!ulId || ulId === 'default') {
            return NextResponse.json([]);
        }

        const urlStr = request?.url || 'http://localhost/api/vehicles';
        const { searchParams } = new URL(urlStr);
        const isDtView = searchParams.get('view') === 'dt';

        const userRoles = session.user.roles || [];

        let dtCode: string | null = null;
        if (isDtView) {
            if (!hasDTRole(userRoles)) {
                return forbiddenResponse('Accès réservé au rôle DT');
            }
            // Fetch dtCode for active UL
            const ulRes = await db.execute({
                sql: `SELECT dtCode FROM "UniteLocale" WHERE id = ?`,
                args: [ulId],
            });
            dtCode = (ulRes.rows[0]?.dtCode as string) || null;
            if (!dtCode) {
                return NextResponse.json({ error: 'Aucune DT de rattachement configurée pour cette UL' }, { status: 400 });
            }
        }

        const now = new Date();
        // Vue DT uniquement : fenêtre de disponibilité (instant présent sans `from`/`to`).
        // Hors Vue DT, ces paramètres sont ignorés.
        let dtWindow: DtWindow | null = null;
        if (isDtView) {
            const parsedWindow = parseDtWindow(searchParams.get('from'), searchParams.get('to'), now);
            if (!parsedWindow.ok) {
                return NextResponse.json({ error: parsedWindow.error }, { status: 400 });
            }
            dtWindow = parsedWindow.window;
        }

        const nowISO = now.toISOString();
        const todayDate = nowISO.split('T')[0];

        const whereClause = isDtView && dtCode
            ? `WHERE v.ulId IN (SELECT id FROM "UniteLocale" WHERE dtCode = ?)`
            : `WHERE v.ulId = ?`;
        const ulArg = isDtView && dtCode ? dtCode : ulId;

        const sql = `SELECT
                v.*,
                ul.name as ulName,
                t.id as trip_id, u.name as trip_driverName, u2.name as trip_secondDriverName, t.missionType as trip_missionType,
                u.email as trip_driverEmail, u2.email as trip_secondDriverEmail,
                t.checkOutAt as trip_checkOutAt,
                m.id as active_maint_id,
                vc.brand as connection_brand, vc.status as connection_status,
                vc.lastError as connection_lastError, vc.connectedAt as connection_connectedAt
            FROM Vehicle v
            LEFT JOIN "UniteLocale" ul ON ul.id = v.ulId
            LEFT JOIN Trip t ON t.vehicleId = v.id AND t.checkInAt IS NULL
            LEFT JOIN User u ON u.id = t.driverId
            LEFT JOIN User u2 ON u2.id = t.secondDriverId
            LEFT JOIN VehicleConnection vc ON vc.vehicleId = v.id
            LEFT JOIN VehicleMaintenance m ON m.vehicleId = v.id
              AND (
                (m.startDate LIKE '%T%' AND m.startDate <= ?) OR
                (m.startDate NOT LIKE '%T%' AND m.startDate <= ?)
              )
              AND (
                m.endDate IS NULL OR
                (m.endDate LIKE '%T%' AND m.endDate > ?) OR
                (m.endDate NOT LIKE '%T%' AND m.endDate >= ?)
              )
            ${whereClause}
            ORDER BY v.name ASC`;

        const result = await db.execute({
            sql,
            args: [nowISO, todayDate, nowISO, todayDate, ulArg],
        });

        // Group the results manually to match Prisma's output structure
        const vehiclesMap = new Map();
        for (const row of result.rows) {
            const vehicleId = row.id as string;
            if (!vehiclesMap.has(vehicleId)) {
                vehiclesMap.set(vehicleId, {
                    id: vehicleId,
                    name: row.name,
                    type: row.type,
                    plate: row.plate,
                    // Règle unique de statut effectif (pure, sans I/O) — cf. `@/lib/vehicleStatusRecalc`.
                    status: computeEffectiveStatus(row.status as string, Boolean(row.active_maint_id)),
                    // Flag parallèle au statut : un véhicule `IN_USE` peut porter une
                    // maintenance active, que la projection de `status` ci-dessus masque.
                    hasActiveMaintenance: Boolean(row.active_maint_id),
                    parkingSpot: row.parkingSpot,
                    fuelLevel: row.fuelLevel,
                    mileage: row.mileage,
                    hasDSA: !!row.hasDSA,
                    notes: row.notes,
                    vin: row.vin,
                    fuelType: row.fuelType,
                    transmission: row.transmission as string | null,
                    maxFuelCapacity: row.maxFuelCapacity as number | null,
                    maxBatteryCapacityKwh: row.maxBatteryCapacityKwh as number | null,
                    ulId: row.ulId as string | null,
                    ulName: row.ulName as string | null,
                    // Vue DT : renvoyée pour des véhicules d'autres ULs. Ce n'est pas une fuite de
                    // credential, mais `canManage` ne doit jamais en être dérivé (rôles + ulId seuls).
                    connection: row.connection_status ? {
                        brand: row.connection_brand as string,
                        status: row.connection_status as string,
                        lastError: row.connection_lastError as string | null,
                        connectedAt: row.connection_connectedAt as string,
                    } : null,
                    createdAt: new Date(row.createdAt as string),
                    updatedAt: new Date(row.updatedAt as string),
                    trips: []
                });
            }
            if (row.trip_id) {
                vehiclesMap.get(vehicleId).trips.push({
                    id: row.trip_id,
                    driverName: row.trip_driverName,
                    driverEmail: row.trip_driverEmail as string | null,
                    secondDriverName: row.trip_secondDriverName,
                    secondDriverEmail: row.trip_secondDriverEmail as string | null,
                    missionType: row.trip_missionType,
                    checkOutAt: new Date(row.trip_checkOutAt as string),
                });
            }
        }

        if (dtWindow && dtCode) {
            await attachDtAvailability(vehiclesMap, result.rows, dtCode, dtWindow, now);
        }

        return NextResponse.json(Array.from(vehiclesMap.values()));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error fetching vehicles:', errorMessage);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des véhicules', detail: errorMessage },
            { status: 500 }
        );
    }
}

async function postHandler(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        if (!isAdminOrAbove(session.user.roles || [])) {
            return forbiddenResponse();
        }

        const body = await request.json();
        const data = createVehicleSchema.parse(body);

        // Vérifie si un véhicule avec le même nom existe déjà
        const existingName = await db.execute({
            sql: `SELECT id FROM Vehicle WHERE UPPER(name) = UPPER(?)`,
            args: [data.name.trim()]
        });
        if (existingName.rows.length > 0) {
            return NextResponse.json(
                { error: 'Un véhicule avec ce nom existe déjà.' },
                { status: 400 }
            );
        }

        // Vérifie si un véhicule avec la même plaque d'immatriculation existe déjà
        const existingPlate = await db.execute({
            sql: `SELECT id FROM Vehicle WHERE UPPER(plate) = UPPER(?)`,
            args: [data.plate.trim()]
        });
        if (existingPlate.rows.length > 0) {
            return NextResponse.json(
                { error: 'Un véhicule avec cette plaque d\'immatriculation existe déjà.' },
                { status: 400 }
            );
        }

        const id = crypto.randomUUID();
        const timestamp = new Date().toISOString();
        const userUlId = session?.user?.ulId;
        const ulId = userUlId && userUlId !== 'default' ? userUlId : null;

        await db.execute({
            sql: `INSERT INTO Vehicle (id, name, type, plate, status, parkingSpot, fuelLevel, mileage, hasDSA, desinfTracking, notes, vin, fuelType, transmission, maxFuelCapacity, maxBatteryCapacityKwh, firstRegistrationDate, revisionKmInterval, revisionYearInterval, ulId, createdAt, updatedAt)
                  VALUES (?, ?, ?, ?, 'AVAILABLE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                id,
                data.name,
                data.type,
                data.plate,
                data.parkingSpot ?? null,
                data.fuelLevel,
                data.mileage,
                data.hasDSA ? 1 : 0,
                data.desinfTracking ? 1 : 0,
                data.notes ?? null,
                null, // vin : écrit uniquement par le flux de connexion du véhicule
                data.fuelType ?? null,
                data.transmission ?? null,
                data.maxFuelCapacity ?? null,
                data.maxBatteryCapacityKwh ?? null,
                data.firstRegistrationDate ?? null,
                data.revisionKmInterval ?? null,
                data.revisionYearInterval ?? null,
                ulId,
                timestamp,
                timestamp
            ]
        });

        // Match the Prisma return format
        const vehicle = {
            id,
            name: data.name,
            type: data.type,
            plate: data.plate,
            status: 'AVAILABLE',
            parkingSpot: data.parkingSpot || null,
            fuelLevel: data.fuelLevel,
            mileage: data.mileage,
            hasDSA: data.hasDSA,
            desinfTracking: data.desinfTracking,
            notes: data.notes || null,
            fuelType: data.fuelType ?? null,
            transmission: data.transmission ?? null,
            maxFuelCapacity: data.maxFuelCapacity ?? null,
            maxBatteryCapacityKwh: data.maxBatteryCapacityKwh ?? null,
            ulId,
            createdAt: timestamp,
            updatedAt: timestamp
        };

        return NextResponse.json(vehicle, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Error creating vehicle:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la création du véhicule' },
            { status: 500 }
        );
    }
}

export const POST = withAudit(postHandler, { action: "Création d'un véhicule", entityType: 'vehicle' });
