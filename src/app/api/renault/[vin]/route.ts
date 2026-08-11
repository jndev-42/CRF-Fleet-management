import { NextResponse } from 'next/server';
import { getRenaultVehicleData } from '@/lib/renault';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isSuperAdmin } from '@/lib/roles';

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

        const vehicleResult = await db.execute({
            sql: `SELECT ulId FROM Vehicle WHERE vin = ?`,
            args: [vin],
        });
        if (vehicleResult.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }
        if (!isSuperAdmin(session.user.roles || []) && session.user.ulId !== vehicleResult.rows[0].ulId) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

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
