import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isInactive } from '@/lib/roles';
import { getRenaultVehicleData } from '@/lib/renault';

/**
 * POST /api/qr/[token]/checkout
 *
 * Creates a trip (checkout) for the vehicle identified by a QR token.
 * Access: any authenticated, non-INACTIF CRF user — no UL or driver-role check.
 */

const checkOutSchema = z.object({
    missionType: z.string().min(1, 'Le type de mission est requis'),
    missionName: z.string().optional(),
    conditionOut: z.string().min(1, "L'état du véhicule est requis"),
    cleanlinessOut: z.string().optional(),
    parkingOut: z.string().optional(),
    dsaChecked: z.boolean().default(false),
    commentsOut: z.string().optional(),
    dataIncorrect: z.boolean().optional(),
    correctedMileage: z.number().int().min(0).optional(),
    correctedFuel: z.number().int().min(0).max(100).optional(),
});

export async function POST(
    request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        if (isInactive(session.user.roles || [])) {
            return NextResponse.json({ error: 'Compte inactif — accès refusé' }, { status: 403 });
        }

        const { token } = await params;
        const body = await request.json();
        const data = checkOutSchema.parse(body);

        // Resolve token → vehicle
        const vehicleRes = await db.execute({
            sql: `SELECT * FROM Vehicle WHERE qrToken = ?`,
            args: [token],
        });

        if (vehicleRes.rows.length === 0) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        const vehicle = vehicleRes.rows[0];

        if (vehicle.status !== 'AVAILABLE') {
            return NextResponse.json({ error: 'Ce véhicule n\'est pas disponible' }, { status: 400 });
        }

        // Fetch live Renault data if connected
        let mileageOut = vehicle.mileage as number;
        let fuelOut = vehicle.fuelLevel as number;
        const vin = vehicle.vin as string | null;

        if (vin) {
            try {
                const rData = await getRenaultVehicleData(vin);
                if (rData.totalMileage !== null) mileageOut = rData.totalMileage;
                if (rData.isElectric && rData.batteryLevel !== null) fuelOut = rData.batteryLevel;
                if (!rData.isElectric && rData.fuelQuantity !== null) {
                    fuelOut = Math.min(
                        Math.round((rData.fuelQuantity / (Number(vehicle.maxFuelCapacity) || 50)) * 100),
                        100
                    );
                }
            } catch (e) {
                console.error('Failed to get live Renault data during QR checkout:', e);
            }
        }

        // Override with user-reported corrections
        if (data.dataIncorrect) {
            if (data.correctedMileage !== undefined) mileageOut = data.correctedMileage;
            if (data.correctedFuel !== undefined) fuelOut = data.correctedFuel;
        }

        const driverId = session.user.id;
        const vehicleId = vehicle.id as string;
        const tripId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        const tx = await db.transaction('write');
        try {
            await tx.execute({
                sql: `INSERT INTO Trip (
                        id, vehicleId, driverId, secondDriverId, missionType, missionName,
                        checkOutAt, mileageOut, fuelOut, conditionOut, cleanlinessOut,
                        parkingOut, dsaChecked, commentsOut, createdAt
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    tripId,
                    vehicleId,
                    driverId,
                    null, // no second driver on QR checkout
                    data.missionType,
                    data.missionName || null,
                    timestamp,
                    mileageOut,
                    fuelOut,
                    data.conditionOut,
                    data.cleanlinessOut || null,
                    data.parkingOut || (vehicle.parkingSpot as string) || null,
                    data.dsaChecked ? 1 : 0,
                    data.commentsOut || null,
                    timestamp,
                ],
            });

            await tx.execute({
                sql: `UPDATE Vehicle SET status = 'IN_USE', mileage = ?, fuelLevel = ?, updatedAt = ? WHERE id = ?`,
                args: [mileageOut, fuelOut, timestamp, vehicleId],
            });

            await tx.commit();
        } catch (e) {
            await tx.rollback();
            throw e;
        }

        return NextResponse.json({
            tripId,
            vehicleId,
            driverName: session.user.name || null,
            driverEmail: session.user.email || null,
            checkOutAt: timestamp,
            mileageOut,
            fuelOut,
        }, { status: 201 });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Error during QR checkout:', error);
        return NextResponse.json({ error: 'Erreur lors de la prise du véhicule' }, { status: 500 });
    }
}
