import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRenaultVehicleData } from '@/lib/renault';
import { auth } from '@/auth';

export const maxDuration = 30;

const VALIDATION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes between checks
const MAX_RETRY_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours max retry window

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;

    const tripResult = await db.execute({
        sql: 'SELECT * FROM Trip WHERE id = ?',
        args: [id]
    });
    const trip = tripResult.rows[0];
    if (!trip) {
        return NextResponse.json({ error: 'Trip non trouvé' }, { status: 404 });
    }

    // Only process trips with pending validation (renaultDataValidated = 0)
    if (trip.renaultDataValidated !== 0) {
        return NextResponse.json({
            validated: true,
            mileageIn: trip.mileageIn,
            fuelIn: trip.fuelIn
        });
    }

    // Throttle: don't re-check within 5 minutes
    if (trip.renaultLastCheckedAt) {
        const lastChecked = new Date(trip.renaultLastCheckedAt as string).getTime();
        if (Date.now() - lastChecked < THROTTLE_MS) {
            return NextResponse.json({
                status: 'throttled',
                validated: false,
                mileageIn: trip.mileageIn,
                fuelIn: trip.fuelIn
            });
        }
    }

    // Max retry window: if checkInAt > 2h ago, auto-validate with current data
    const checkInMs = new Date(trip.checkInAt as string).getTime();
    if (Date.now() - checkInMs > MAX_RETRY_WINDOW_MS) {
        await db.execute({
            sql: 'UPDATE Trip SET renaultDataValidated = 1, renaultLastCheckedAt = ? WHERE id = ?',
            args: [new Date().toISOString(), id]
        });
        return NextResponse.json({
            validated: true,
            mileageIn: trip.mileageIn,
            fuelIn: trip.fuelIn
        });
    }

    // Fetch vehicle info
    const vehicleResult = await db.execute({
        sql: 'SELECT * FROM Vehicle WHERE id = ?',
        args: [trip.vehicleId]
    });
    const vehicle = vehicleResult.rows[0];
    const vin = vehicle?.vin as string | null;

    if (!vin) {
        return NextResponse.json({ error: 'Véhicule non connecté' }, { status: 400 });
    }

    const now = new Date().toISOString();

    try {
        const rData = await getRenaultVehicleData(vin);
        const cockpitMs = rData.cockpitTimestamp
            ? new Date(rData.cockpitTimestamp).getTime()
            : null;
        const isValidated = cockpitMs !== null && cockpitMs >= checkInMs - VALIDATION_WINDOW_MS;

        if (isValidated) {
            // Compute updated values from fresh Renault data
            const newMileageIn: number = rData.totalMileage ?? (trip.mileageIn as number);
            let newFuelIn: number = trip.fuelIn as number;

            if (rData.isElectric && rData.batteryLevel !== null) {
                newFuelIn = rData.batteryLevel;
            } else if (!rData.isElectric && rData.fuelQuantity !== null) {
                newFuelIn = Math.min(Math.round((rData.fuelQuantity / 50) * 100), 100);
            }

            const tx = await db.transaction('write');
            try {
                await tx.execute({
                    sql: 'UPDATE Trip SET mileageIn = ?, fuelIn = ?, renaultDataValidated = 1, renaultLastCheckedAt = ? WHERE id = ?',
                    args: [newMileageIn, newFuelIn, now, id]
                });
                await tx.execute({
                    sql: 'UPDATE Vehicle SET mileage = ?, fuelLevel = ?, updatedAt = ? WHERE id = ?',
                    args: [newMileageIn, newFuelIn, now, trip.vehicleId]
                });
                await tx.commit();
            } catch (e) {
                await tx.rollback();
                throw e;
            }

            return NextResponse.json({
                validated: true,
                mileageIn: newMileageIn,
                fuelIn: newFuelIn
            });
        } else {
            // Not validated yet — update throttle timestamp
            await db.execute({
                sql: 'UPDATE Trip SET renaultLastCheckedAt = ? WHERE id = ?',
                args: [now, id]
            });
            return NextResponse.json({
                validated: false,
                mileageIn: trip.mileageIn,
                fuelIn: trip.fuelIn
            });
        }
    } catch (e) {
        console.error('refresh-renault error:', e);
        // Update throttle even on error to avoid hammering the Renault API
        await db.execute({
            sql: 'UPDATE Trip SET renaultLastCheckedAt = ? WHERE id = ?',
            args: [now, id]
        });
        return NextResponse.json({ error: 'Erreur Renault API' }, { status: 500 });
    }
}
