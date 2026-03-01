import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const createVehicleSchema = z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    plate: z.string().min(1),
    parkingSpot: z.string().optional(),
    fuelLevel: z.number().min(0).max(100).default(100),
    mileage: z.number().min(0).default(0),
    hasDSA: z.boolean().default(false),
    notes: z.string().optional(),
});

export async function GET() {
    try {
        const result = await db.execute(`
            SELECT 
                v.*,
                t.id as trip_id, t.driverName as trip_driverName, t.secondDriverName as trip_secondDriverName, t.missionType as trip_missionType,
                t.checkOutAt as trip_checkOutAt
            FROM Vehicle v
            LEFT JOIN Trip t ON t.vehicleId = v.id AND t.checkInAt IS NULL
            ORDER BY v.name ASC
        `);

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
        const body = await request.json();
        const data = createVehicleSchema.parse(body);

        const id = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        await db.execute({
            sql: `INSERT INTO Vehicle (id, name, type, plate, parkingSpot, fuelLevel, mileage, hasDSA, notes, createdAt, updatedAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                id,
                data.name,
                data.type,
                data.plate,
                data.parkingSpot || null,
                data.fuelLevel,
                data.mileage,
                data.hasDSA ? 1 : 0,
                data.notes || null,
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
            notes: data.notes || null,
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
