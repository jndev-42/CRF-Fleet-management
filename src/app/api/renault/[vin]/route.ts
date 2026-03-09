import { NextResponse } from 'next/server';
import { getRenaultVehicleData } from '@/lib/renault';
import { auth } from '@/auth';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ vin: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { vin } = await params;

        const data = await getRenaultVehicleData(vin);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Renault API error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des données Renault' },
            { status: 500 }
        );
    }
}
