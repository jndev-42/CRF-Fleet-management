import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

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
        const trip = await prisma.trip.findUnique({
            where: { id },
            include: { vehicle: true },
        });

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

        // Mettre à jour le trip et le véhicule en transaction
        const updatedTrip = await prisma.$transaction(async (tx: typeof prisma) => {
            const result = await tx.trip.update({
                where: { id },
                data: {
                    checkInAt: new Date(),
                    mileageIn: data.mileageIn,
                    fuelIn: data.fuelIn,
                    parkingIn: data.parkingIn,
                    conditionIn: data.conditionIn,
                    windowsClosed: data.windowsClosed,
                    vehicleInspected: data.vehicleInspected,
                    incident: data.incident || null,
                    dsaUsed: data.dsaUsed,
                    commentsIn: data.commentsIn || null,
                    parkingPhoto: data.parkingPhoto || null,
                },
                include: { vehicle: true },
            });

            await tx.vehicle.update({
                where: { id: trip.vehicleId },
                data: {
                    status: 'AVAILABLE',
                    mileage: data.mileageIn,
                    fuelLevel: data.fuelIn,
                    parkingSpot: data.parkingIn || trip.vehicle.parkingSpot,
                },
            });

            return result;
        });

        return NextResponse.json(updatedTrip);
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
