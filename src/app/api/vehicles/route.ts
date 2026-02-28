import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

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
        const vehicles = await prisma.vehicle.findMany({
            include: {
                trips: {
                    where: { checkInAt: null },
                    take: 1,
                },
            },
            orderBy: { name: 'asc' },
        });
        return NextResponse.json(vehicles);
    } catch (error) {
        console.error('Error fetching vehicles:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des véhicules' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = createVehicleSchema.parse(body);

        const vehicle = await prisma.vehicle.create({
            data,
        });

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
