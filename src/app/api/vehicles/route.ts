import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';

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
    vin: z.string().optional().nullable(),
    fuelType: z.string().optional().nullable(),
    maxFuelCapacity: z.number().int().min(1).optional().nullable(),
    maxBatteryCapacityKwh: z.number().int().min(1).optional().nullable(),
    firstRegistrationDate: z.string().optional().nullable(),
    revisionKmInterval: z.number().int().positive().optional().nullable(),
    revisionYearInterval: z.number().int().positive().optional().nullable(),
});

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const ulId = session.user.ulId;

        // Un utilisateur sans UL ne voit aucun véhicule
        if (!ulId || ulId === 'default') {
            return NextResponse.json([]);
        }

        const sql = `SELECT
                v.*,
                t.id as trip_id, u.name as trip_driverName, u2.name as trip_secondDriverName, t.missionType as trip_missionType,
                t.checkOutAt as trip_checkOutAt
            FROM Vehicle v
            LEFT JOIN Trip t ON t.vehicleId = v.id AND t.checkInAt IS NULL
            LEFT JOIN User u ON u.id = t.driverId
            LEFT JOIN User u2 ON u2.id = t.secondDriverId
            WHERE v.ulId = '${ulId}'
            ORDER BY v.name ASC`;

        const result = await db.execute(sql);


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
                    status: row.status,
                    parkingSpot: row.parkingSpot,
                    fuelLevel: row.fuelLevel,
                    mileage: row.mileage,
                    hasDSA: !!row.hasDSA,
                    notes: row.notes,
                    vin: row.vin,
                    fuelType: row.fuelType,
                    maxFuelCapacity: row.maxFuelCapacity as number | null,
                    maxBatteryCapacityKwh: row.maxBatteryCapacityKwh as number | null,
                    createdAt: new Date(row.createdAt as string),
                    updatedAt: new Date(row.updatedAt as string),
                    trips: []
                });
            }
            if (row.trip_id) {
                vehiclesMap.get(vehicleId).trips.push({
                    id: row.trip_id,
                    driverName: row.trip_driverName,
                    secondDriverName: row.trip_secondDriverName,
                    missionType: row.trip_missionType,
                    checkOutAt: new Date(row.trip_checkOutAt as string),
                });
            }
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

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!isAdminOrAbove(session?.user?.roles || [])) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
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
            sql: `INSERT INTO Vehicle (id, name, type, plate, status, parkingSpot, fuelLevel, mileage, hasDSA, desinfTracking, notes, vin, fuelType, maxFuelCapacity, maxBatteryCapacityKwh, firstRegistrationDate, revisionKmInterval, revisionYearInterval, ulId, createdAt, updatedAt)
                  VALUES (?, ?, ?, ?, 'AVAILABLE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                data.vin ?? null,
                data.fuelType ?? null,
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
