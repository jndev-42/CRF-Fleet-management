import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

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
        const vehicle = await prisma.vehicle.findUnique({
            where: { id },
            include: {
                trips: {
                    orderBy: { checkOutAt: 'desc' },
                    take: 20,
                },
            },
        });

        if (!vehicle) {
            return NextResponse.json(
                { error: 'Véhicule non trouvé' },
                { status: 404 }
            );
        }

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

        const vehicle = await prisma.vehicle.update({
            where: { id },
            data,
        });

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
