import { NextResponse } from 'next/server';
import { getRenaultVehicleData, VehicleNotConnectedError } from '@/lib/vehicle-connection';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ vin: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const { vin } = await params;

        const vehicleResult = await db.execute({
            sql: `SELECT id, ulId FROM Vehicle WHERE vin = ?`,
            args: [vin],
        });
        if (vehicleResult.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }
        if (!isSuperAdmin(session.user.roles || []) && session.user.ulId !== vehicleResult.rows[0].ulId) {
            return forbiddenResponse();
        }

        // getRenaultVehicleData prend l'UUID du véhicule, jamais son VIN :
        // c'est l'UUID qui ancre la résolution du credential et du statut.
        const data = await getRenaultVehicleData(String(vehicleResult.rows[0].id));
        return NextResponse.json(data);
    } catch (error) {
        if (error instanceof VehicleNotConnectedError) {
            return NextResponse.json({ error: 'Véhicule non connecté' }, { status: 400 });
        }
        console.error('Renault API error:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des données Renault' },
            { status: 500 }
        );
    }
}
