import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const checkInSchema = z.object({
    mileageIn: z.number().min(0, 'Le kilométrage est requis'),
    fuelIn: z.number().min(0).max(100, "Le niveau d'essence doit être entre 0 et 100"),
    parkingIn: z.string().optional(),
    conditionIn: z.string().min(1, "L'état du véhicule est requis"),
    windowsClosed: z.boolean().default(false),
    vehicleInspected: z.boolean().default(false),
    incident: z.string().optional(),
    dsaUsed: z.boolean().default(false),
    commentsIn: z.string().optional(),
    parkingPhoto: z.string().optional(),
});

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const data = checkInSchema.parse(body);

        // Vérifier que le trip existe et n'est pas déjà clôturé
        const tripResult = await db.execute({
            sql: `SELECT * FROM Trip WHERE id = ?`,
            args: [id]
        });
        const trip = tripResult.rows.length > 0 ? tripResult.rows[0] : null;

        if (!trip) {
            return NextResponse.json(
                { error: 'Sortie non trouvée' },
                { status: 404 }
            );
        }

        if (trip.checkInAt) {
            return NextResponse.json(
                { error: 'Ce véhicule a déjà été rendu' },
                { status: 400 }
            );
        }

        const vehicleResult = await db.execute({
            sql: `SELECT * FROM Vehicle WHERE id = ?`,
            args: [trip.vehicleId]
        });
        const vehicle = vehicleResult.rows[0];

        // Mettre à jour le trip et le véhicule en transaction
        const tx = await db.transaction('write');
        const timestamp = new Date().toISOString();

        try {
            await tx.execute({
                sql: `UPDATE Trip SET 
                        checkInAt = ?, mileageIn = ?, fuelIn = ?, parkingIn = ?, conditionIn = ?, 
                        windowsClosed = ?, vehicleInspected = ?, incident = ?, dsaUsed = ?, 
                        commentsIn = ?, parkingPhoto = ?
                      WHERE id = ?`,
                args: [
                    timestamp,
                    data.mileageIn,
                    data.fuelIn,
                    data.parkingIn || null,
                    data.conditionIn,
                    data.windowsClosed ? 1 : 0,
                    data.vehicleInspected ? 1 : 0,
                    data.incident || null,
                    data.dsaUsed ? 1 : 0,
                    data.commentsIn || null,
                    data.parkingPhoto || null,
                    id
                ]
            });

            await tx.execute({
                sql: `UPDATE Vehicle SET 
                        status = 'AVAILABLE', mileage = ?, fuelLevel = ?, parkingSpot = ?, updatedAt = ? 
                      WHERE id = ?`,
                args: [
                    data.mileageIn,
                    data.fuelIn,
                    data.parkingIn || vehicle.parkingSpot,
                    timestamp,
                    trip.vehicleId
                ]
            });

            await tx.commit();

            const updatedTrip = {
                ...trip,
                checkInAt: timestamp,
                mileageIn: data.mileageIn,
                fuelIn: data.fuelIn,
                parkingIn: data.parkingIn || null,
                conditionIn: data.conditionIn,
                windowsClosed: data.windowsClosed,
                vehicleInspected: data.vehicleInspected,
                incident: data.incident || null,
                dsaUsed: data.dsaUsed,
                commentsIn: data.commentsIn || null,
                parkingPhoto: data.parkingPhoto || null,
                vehicle: {
                    ...vehicle,
                    status: 'AVAILABLE',
                    mileage: data.mileageIn,
                    fuelLevel: data.fuelIn,
                    parkingSpot: data.parkingIn || vehicle.parkingSpot,
                    updatedAt: timestamp
                }
            };

            return NextResponse.json(updatedTrip);
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
        console.error('Error checking in:', error);
        return NextResponse.json(
            { error: 'Erreur lors du retour du véhicule' },
            { status: 500 }
        );
    }
}
