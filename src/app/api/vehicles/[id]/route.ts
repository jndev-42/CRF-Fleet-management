import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const updateVehicleSchema = z.object({
    name: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    plate: z.string().min(1).optional(),
    status: z.enum(['AVAILABLE', 'IN_USE', 'MAINTENANCE']).optional(),
    parkingSpot: z.string().optional().nullable(),
    fuelLevel: z.number().min(0).max(100).optional(),
    mileage: z.number().min(0).optional(),
    hasDSA: z.boolean().optional(),
    notes: z.string().optional().nullable(),
});

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Fetch vehicle by name since [id] is now the vehicle name
        const vehicleResult = await db.execute({
            sql: `SELECT * FROM Vehicle WHERE name = ?`,
            args: [id]
        });

        if (vehicleResult.rows.length === 0) {
            return NextResponse.json(
                { error: 'Véhicule non trouvé' },
                { status: 404 }
            );
        }

        const row = vehicleResult.rows[0];

        // Fetch trips using the actual vehicle UUID
        const tripsResult = await db.execute({
            sql: `SELECT * FROM Trip WHERE vehicleId = ? ORDER BY checkOutAt DESC LIMIT 20`,
            args: [row.id]
        });

        const vehicle = {
            id: row.id,
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
            trips: tripsResult.rows.map((tRow: any) => ({
                id: tRow.id,
                vehicleId: tRow.vehicleId,
                driverName: tRow.driverName,
                driverEmail: tRow.driverEmail,
                secondDriverName: tRow.secondDriverName || null,
                secondDriverEmail: tRow.secondDriverEmail || null,
                missionType: tRow.missionType,
                missionName: tRow.missionName,
                checkOutAt: new Date(tRow.checkOutAt as string),
                mileageOut: tRow.mileageOut,
                fuelOut: tRow.fuelOut,
                conditionOut: tRow.conditionOut,
                parkingOut: tRow.parkingOut,
                dsaChecked: !!tRow.dsaChecked,
                commentsOut: tRow.commentsOut,
                checkInAt: tRow.checkInAt ? new Date(tRow.checkInAt as string) : null,
                mileageIn: tRow.mileageIn,
                fuelIn: tRow.fuelIn,
                conditionIn: tRow.conditionIn,
                parkingIn: tRow.parkingIn,
                windowsClosed: tRow.windowsClosed !== null ? !!tRow.windowsClosed : null,
                vehicleInspected: tRow.vehicleInspected !== null ? !!tRow.vehicleInspected : null,
                incident: tRow.incident,
                dsaUsed: tRow.dsaUsed !== null ? !!tRow.dsaUsed : null,
                commentsIn: tRow.commentsIn,
                parkingPhoto: tRow.parkingPhoto,
                createdAt: new Date(tRow.createdAt as string),
            }))
        };

        return NextResponse.json(vehicle);
    } catch (error) {
        console.error('Error fetching vehicle:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération du véhicule' },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const data = updateVehicleSchema.parse(body);

        const setClauses = [];
        const args = [];
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                setClauses.push(`${key} = ?`);
                args.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
            }
        }

        let vehicle = null;
        if (setClauses.length > 0) {
            const timestamp = new Date().toISOString();
            setClauses.push(`updatedAt = ?`);
            args.push(timestamp);
            args.push(id);

            await db.execute({
                sql: `UPDATE Vehicle SET ${setClauses.join(', ')} WHERE name = ?`,
                args
            });

            vehicle = { id, ...data, updatedAt: timestamp };
        }

        return NextResponse.json(vehicle);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Error updating vehicle:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la mise à jour du véhicule' },
            { status: 500 }
        );
    }
}
