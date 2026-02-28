import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const checkOutSchema = z.object({
    vehicleId: z.string().min(1),
    driverName: z.string().min(1, 'Le nom du chauffeur est requis'),
    driverEmail: z.string().email().optional().or(z.literal('')),
    missionType: z.string().min(1, 'Le type de mission est requis'),
    missionName: z.string().optional(),
    conditionOut: z.string().min(1, "L'état du véhicule est requis"),
    parkingOut: z.string().optional(),
    dsaChecked: z.boolean().default(false),
    commentsOut: z.string().optional(),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = checkOutSchema.parse(body);

        // Vérifier que le véhicule est disponible
        const vehicleResult = await db.execute({
            sql: `SELECT * FROM Vehicle WHERE id = ?`,
            args: [data.vehicleId]
        });
        const vehicle = vehicleResult.rows[0];

        if (!vehicle) {
            return NextResponse.json(
                { error: 'Véhicule non trouvé' },
                { status: 404 }
            );
        }

        if (vehicle.status !== 'AVAILABLE') {
            return NextResponse.json(
                { error: 'Ce véhicule n\'est pas disponible' },
                { status: 400 }
            );
        }

        // Créer le trip et mettre à jour le véhicule en transaction
        const tx = await db.transaction('write');
        const tripId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        try {
            await tx.execute({
                sql: `INSERT INTO Trip (
                        id, vehicleId, driverName, driverEmail, missionType, missionName, 
                        checkOutAt, mileageOut, fuelOut, conditionOut, parkingOut, dsaChecked, commentsOut, createdAt
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    tripId,
                    data.vehicleId,
                    data.driverName,
                    data.driverEmail || null,
                    data.missionType,
                    data.missionName || null,
                    timestamp, // checkOutAt
                    vehicle.mileage as number,
                    vehicle.fuelLevel as number,
                    data.conditionOut,
                    data.parkingOut || (vehicle.parkingSpot as string) || null,
                    data.dsaChecked ? 1 : 0,
                    data.commentsOut || null,
                    timestamp // createdAt
                ]
            });

            await tx.execute({
                sql: `UPDATE Vehicle SET status = 'IN_USE', updatedAt = ? WHERE id = ?`,
                args: [timestamp, data.vehicleId]
            });

            await tx.commit();

            const trip = {
                id: tripId,
                vehicleId: data.vehicleId,
                driverName: data.driverName,
                driverEmail: data.driverEmail || null,
                missionType: data.missionType,
                missionName: data.missionName || null,
                checkOutAt: timestamp,
                mileageOut: vehicle.mileage,
                fuelOut: vehicle.fuelLevel,
                conditionOut: data.conditionOut,
                parkingOut: data.parkingOut || vehicle.parkingSpot,
                dsaChecked: data.dsaChecked,
                commentsOut: data.commentsOut || null,
                createdAt: timestamp,
                vehicle: { ...vehicle }
            };

            return NextResponse.json(trip, { status: 201 });
        } catch (e) {
            await tx.rollback();
            throw e;
        }



    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Error creating trip:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la prise du véhicule' },
            { status: 500 }
        );
    }
}
