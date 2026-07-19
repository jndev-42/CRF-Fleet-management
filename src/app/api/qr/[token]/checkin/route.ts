import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isInactive, isAdminOrAbove } from '@/lib/roles';
import { getRenaultVehicleData } from '@/lib/renault';

/**
 * POST /api/qr/[token]/checkin
 *
 * Checks in the active trip for the vehicle identified by a QR token.
 * Access: the driver, second driver, or any admin — no UL check.
 */

const checkInSchema = z.object({
    mileageIn: z.number().min(0).optional(),
    fuelIn: z.number().min(0).max(100).optional(),
    parkingIn: z.string().optional(),
    conditionIn: z.string().min(1, "L'état du véhicule est requis"),
    cleanlinessIn: z.string().optional(),
    incident: z.string().optional(),
    commentsIn: z.string().optional(),
    checklistIn: z.record(z.string(), z.boolean()).optional(),
    desinfResponsable: z.string().optional(),
    desinfLotNumber: z.string().optional(),
    desinfType: z.string().optional(),
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
        const data = checkInSchema.parse(body);

        // Resolve token → vehicle
        const vehicleRes = await db.execute({
            sql: `SELECT * FROM Vehicle WHERE qrToken = ?`,
            args: [token],
        });

        if (vehicleRes.rows.length === 0) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        const vehicle = vehicleRes.rows[0];

        // Find active trip for this vehicle
        const tripRes = await db.execute({
            sql: `SELECT * FROM Trip WHERE vehicleId = ? AND checkInAt IS NULL LIMIT 1`,
            args: [vehicle.id],
        });

        if (tripRes.rows.length === 0) {
            return NextResponse.json({ error: 'Aucun emprunt actif pour ce véhicule' }, { status: 404 });
        }

        const trip = tripRes.rows[0];

        // Authorization: driver, second driver, or admin
        const userId = session.user.id;
        const isAdmin = isAdminOrAbove(session.user.roles || []);
        const isFirstDriver = userId === trip.driverId;
        const isSecondDriver = userId === trip.secondDriverId;

        if (!isAdmin && !isFirstDriver && !isSecondDriver) {
            return NextResponse.json({
                error: "Vous n'êtes pas autorisé à rendre ce véhicule. Seul l'emprunteur peut le faire via ce QR Code.",
            }, { status: 403 });
        }

        // Fetch live Renault data if connected and data not supplied
        let finalMileageIn = data.mileageIn;
        let finalFuelIn = data.fuelIn;
        const vin = vehicle.vin as string | null;
        const isConnected = !!vin;

        const VALIDATION_WINDOW_MS = 5 * 60 * 1000;
        let cockpitTimestampMs: number | null = null;

        if (vin && (finalMileageIn === undefined || finalFuelIn === undefined)) {
            try {
                const rData = await getRenaultVehicleData(vin);
                if (finalMileageIn === undefined && rData.totalMileage !== null) {
                    finalMileageIn = rData.totalMileage;
                }
                if (finalFuelIn === undefined) {
                    if (rData.isElectric && rData.batteryLevel !== null) {
                        finalFuelIn = rData.batteryLevel;
                    } else if (!rData.isElectric && rData.fuelQuantity !== null) {
                        finalFuelIn = Math.min(
                            Math.round((rData.fuelQuantity / (Number(vehicle.maxFuelCapacity) || 50)) * 100),
                            100
                        );
                    }
                }
                if (rData.cockpitTimestamp) {
                    cockpitTimestampMs = new Date(rData.cockpitTimestamp).getTime();
                }
            } catch (e) {
                console.error('Failed to get live Renault data during QR checkin:', e);
            }
        }

        if (finalMileageIn === undefined || finalFuelIn === undefined) {
            return NextResponse.json(
                { error: 'Données manquantes : kilométrage et niveau de carburant requis' },
                { status: 400 }
            );
        }

        const timestamp = new Date().toISOString();
        const checkInTimeMs = new Date(timestamp).getTime();

        let renaultDataValidated: number | null = null;
        if (isConnected) {
            renaultDataValidated = (cockpitTimestampMs !== null &&
                cockpitTimestampMs >= checkInTimeMs - VALIDATION_WINDOW_MS) ? 1 : 0;
        }

        const tx = await db.transaction('write');
        try {
            await tx.execute({
                sql: `UPDATE Trip SET
                        checkInAt = ?, mileageIn = ?, fuelIn = ?, parkingIn = ?,
                        conditionIn = ?, cleanlinessIn = ?, incident = ?, commentsIn = ?,
                        checklistIn = ?, renaultDataValidated = ?, renaultLastCheckedAt = ?,
                        desinfResponsable = ?, desinfLotNumber = ?, desinfType = ?
                      WHERE id = ?`,
                args: [
                    timestamp,
                    finalMileageIn,
                    finalFuelIn,
                    data.parkingIn || null,
                    data.conditionIn,
                    data.cleanlinessIn || null,
                    data.incident || null,
                    data.commentsIn || null,
                    data.checklistIn ? JSON.stringify(data.checklistIn) : null,
                    renaultDataValidated,
                    renaultDataValidated !== null ? timestamp : null,
                    data.desinfResponsable || null,
                    data.desinfLotNumber || null,
                    data.desinfType || null,
                    trip.id,
                ],
            });

            await tx.execute({
                sql: `UPDATE Vehicle SET status = 'AVAILABLE', mileage = ?, fuelLevel = ?, parkingSpot = ?, updatedAt = ? WHERE id = ?`,
                args: [
                    finalMileageIn,
                    finalFuelIn,
                    data.parkingIn || vehicle.parkingSpot,
                    timestamp,
                    vehicle.id,
                ],
            });

            if (trip.missionType === 'Désinfection') {
                await tx.execute({
                    sql: `UPDATE Vehicle SET lastDesinfDate = date('now'), nextDesinfMaxDate = date('now', '+42 days') WHERE id = ?`,
                    args: [vehicle.id],
                });
            }

            await tx.commit();
        } catch (e) {
            await tx.rollback();
            throw e;
        }

        return NextResponse.json({ success: true, checkInAt: timestamp });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Error during QR checkin:', error);
        return NextResponse.json({ error: 'Erreur lors du retour du véhicule' }, { status: 500 });
    }
}
