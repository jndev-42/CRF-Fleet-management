import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isInactive } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

/**
 * GET /api/qr/[token]/vehicle
 *
 * Resolves a QR token to a vehicle and returns its public data + active trip.
 * Access control: any authenticated, non-INACTIF CRF user.
 * No UL membership or driver-role check is performed — this is the QR bypass.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return unauthorizedResponse();
    }

    // Block inactive users
    if (isInactive(session.user.roles || [])) {
        return forbiddenResponse('Compte inactif');
    }

    const { token } = await params;

    try {
        // Resolve token → vehicle
        const vehicleRes = await db.execute({
            sql: `SELECT v.*, 
                         t.id          AS trip_id,
                         t.driverId    AS trip_driverId,
                         t.secondDriverId AS trip_secondDriverId,
                         t.missionType AS trip_missionType,
                         t.missionName AS trip_missionName,
                         t.checkOutAt  AS trip_checkOutAt,
                         t.mileageOut  AS trip_mileageOut,
                         t.fuelOut     AS trip_fuelOut,
                         t.conditionOut AS trip_conditionOut,
                         t.cleanlinessOut AS trip_cleanlinessOut,
                         t.parkingOut  AS trip_parkingOut,
                         t.dsaChecked  AS trip_dsaChecked,
                         t.commentsOut AS trip_commentsOut,
                         t.driveFolderId AS trip_driveFolderId,
                         t.checklistOut AS trip_checklistOut,
                         t.createdAt   AS trip_createdAt,
                         u.name        AS trip_driverName,
                         u.email       AS trip_driverEmail,
                         u2.name       AS trip_secondDriverName,
                         u2.email      AS trip_secondDriverEmail
                  FROM Vehicle v
                  LEFT JOIN Trip t ON t.vehicleId = v.id AND t.checkInAt IS NULL
                  LEFT JOIN "User" u  ON u.id = t.driverId
                  LEFT JOIN "User" u2 ON u2.id = t.secondDriverId
                  WHERE v.qrToken = ?`,
            args: [token],
        });

        if (vehicleRes.rows.length === 0) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        const row = vehicleRes.rows[0];

        // Build active trip (if any)
        const activeTrip = row.trip_id
            ? {
                id: row.trip_id as string,
                vehicleId: row.id as string,
                driverId: row.trip_driverId as string,
                secondDriverId: row.trip_secondDriverId as string | null,
                driverName: row.trip_driverName as string | null,
                driverEmail: row.trip_driverEmail as string | null,
                secondDriverName: row.trip_secondDriverName as string | null,
                secondDriverEmail: row.trip_secondDriverEmail as string | null,
                missionType: row.trip_missionType as string,
                missionName: row.trip_missionName as string | null,
                checkOutAt: row.trip_checkOutAt as string,
                mileageOut: row.trip_mileageOut as number,
                fuelOut: row.trip_fuelOut as number,
                conditionOut: row.trip_conditionOut as string,
                cleanlinessOut: row.trip_cleanlinessOut as string | null,
                parkingOut: row.trip_parkingOut as string | null,
                dsaChecked: !!row.trip_dsaChecked,
                commentsOut: row.trip_commentsOut as string | null,
                driveFolderId: row.trip_driveFolderId as string | null,
                checklistOut: row.trip_checklistOut as string | null,
                checkInAt: null,
                createdAt: row.trip_createdAt as string,
            }
            : null;

        const vehicle = {
            id: row.id as string,
            name: row.name as string,
            plate: row.plate as string,
            type: row.type as string,
            status: row.status as string,
            fuelLevel: row.fuelLevel as number,
            mileage: row.mileage as number,
            fuelType: row.fuelType as string | null,
            hasDSA: !!row.hasDSA,
            desinfTracking: !!row.desinfTracking,
            parkingSpot: row.parkingSpot as string | null,
            vin: row.vin as string | null,
            maxFuelCapacity: row.maxFuelCapacity as number | null,
            maxBatteryCapacityKwh: row.maxBatteryCapacityKwh as number | null,
            ulId: row.ulId as string,
            activeTrip,
        };

        return NextResponse.json(vehicle);
    } catch (error) {
        console.error('Error resolving QR token:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
