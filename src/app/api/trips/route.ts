import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

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
        const vehicle = await prisma.vehicle.findUnique({
            where: { id: data.vehicleId },
        });

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const trip = await prisma.$transaction(async (tx: any) => {
            const newTrip = await tx.trip.create({
                data: {
                    vehicleId: data.vehicleId,
                    driverName: data.driverName,
                    driverEmail: data.driverEmail || null,
                    missionType: data.missionType,
                    missionName: data.missionName,
                    mileageOut: vehicle.mileage,
                    fuelOut: vehicle.fuelLevel,
                    parkingOut: data.parkingOut || vehicle.parkingSpot,
                    conditionOut: data.conditionOut,
                    dsaChecked: data.dsaChecked,
                    commentsOut: data.commentsOut,
                },
                include: { vehicle: true },
            });

            await tx.vehicle.update({
                where: { id: data.vehicleId },
                data: { status: 'IN_USE' },
            });

            return newTrip;
        });

        return NextResponse.json(trip, { status: 201 });
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
