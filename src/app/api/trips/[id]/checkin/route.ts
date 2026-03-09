import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getRenaultVehicleData } from '@/lib/renault';
import { auth } from '@/auth';

// Increase duration limits for Vercel Serverless Functions
export const maxDuration = 30; // 30 seconds max duration

const checkInSchema = z.object({
    mileageIn: z.number().min(0, 'Le kilométrage est requis').optional(),
    fuelIn: z.number().min(0).max(100, "Le niveau d'essence doit être entre 0 et 100").optional(),
    parkingIn: z.string().optional(),
    conditionIn: z.string().min(1, "L'état du véhicule est requis"),
    cleanlinessIn: z.string().optional(),
    windowsClosed: z.boolean().default(false),
    vehicleInspected: z.boolean().default(false),
    incident: z.string().optional(),
    dsaUsed: z.boolean().default(false),
    commentsIn: z.string().optional(),
    parkingPhoto: z.string().optional(),
    driveFolderId: z.string().optional(),
    checklistIn: z.record(z.string(), z.boolean()).optional(),
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
        const tripResult = await db.execute({
            sql: `SELECT * FROM Trip WHERE id = ?`,
            args: [id]
        });
        const trip = tripResult.rows.length > 0 ? tripResult.rows[0] : null;

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

        // --- ENFORCE RETURN AUTHORIZATION ---
        const session = await auth();
        const userEmail = session?.user?.email;
        const userRoles = session?.user?.roles || [];

        if (!userEmail) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const isAdmin = userRoles.includes('ADMIN');
        const isFirstDriver = userEmail === trip.driverEmail;
        const isSecondDriver = userEmail === trip.secondDriverEmail;

        if (!isAdmin && !isFirstDriver && !isSecondDriver) {
            return NextResponse.json(
                { error: "Vous n'êtes pas autorisé à rendre ce véhicule. Seul l'emprunteur ou un administrateur peut le faire." },
                { status: 403 }
            );
        }
        // ------------------------------------

        const vehicleResult = await db.execute({
            sql: `SELECT * FROM Vehicle WHERE id = ?`,
            args: [trip.vehicleId]
        });
        const vehicle = vehicleResult.rows[0];

        // Fetch live Renault data if vehicle is connected (has a VIN) and data is missing
        let finalMileageIn = data.mileageIn;
        let finalFuelIn = data.fuelIn;
        const vin = vehicle.vin as string | null;
        const isConnectedVehicle = !!vin;

        const VALIDATION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
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
                        finalFuelIn = Math.min(Math.round((rData.fuelQuantity / 50) * 100), 100);
                    }
                }
                if (rData.cockpitTimestamp) {
                    cockpitTimestampMs = new Date(rData.cockpitTimestamp).getTime();
                }
            } catch (e) {
                console.error('Failed to get live Renault data during checkin', e);
            }
        }

        if (finalMileageIn === undefined || finalFuelIn === undefined) {
            return NextResponse.json(
                { error: 'Données manquantes : kilométrage et niveau de carburant requis' },
                { status: 400 }
            );
        }

        // Mettre à jour le trip et le véhicule en transaction
        const tx = await db.transaction('write');
        const timestamp = new Date().toISOString();
        const checkInTimeMs = new Date(timestamp).getTime();

        // Compute Renault data validation status for connected vehicles
        let renaultDataValidated: number | null = null;
        if (isConnectedVehicle) {
            if (cockpitTimestampMs !== null && cockpitTimestampMs >= checkInTimeMs - VALIDATION_WINDOW_MS) {
                renaultDataValidated = 1; // Validated: Renault data is fresh
            } else {
                renaultDataValidated = 0; // Pending: cockpit timestamp not fresh enough
            }
        }

        try {
            await tx.execute({
                sql: `UPDATE Trip SET
                        checkInAt = ?, mileageIn = ?, fuelIn = ?, parkingIn = ?, conditionIn = ?, cleanlinessIn = ?,
                        windowsClosed = ?, vehicleInspected = ?, incident = ?, dsaUsed = ?,
                        commentsIn = ?, parkingPhoto = ?, driveFolderId = ?, checklistIn = ?,
                        renaultDataValidated = ?, renaultLastCheckedAt = ?
                      WHERE id = ?`,
                args: [
                    timestamp,
                    finalMileageIn,
                    finalFuelIn,
                    data.parkingIn || null,
                    data.conditionIn,
                    data.cleanlinessIn || null,
                    data.windowsClosed ? 1 : 0,
                    data.vehicleInspected ? 1 : 0,
                    data.incident || null,
                    data.dsaUsed ? 1 : 0,
                    data.commentsIn || null,
                    data.parkingPhoto || null,
                    data.driveFolderId || trip.driveFolderId || null,
                    data.checklistIn ? JSON.stringify(data.checklistIn) : null,
                    renaultDataValidated,
                    renaultDataValidated !== null ? timestamp : null,
                    id
                ]
            });

            await tx.execute({
                sql: `UPDATE Vehicle SET 
                        status = 'AVAILABLE', mileage = ?, fuelLevel = ?, parkingSpot = ?, updatedAt = ? 
                      WHERE id = ?`,
                args: [
                    finalMileageIn,
                    finalFuelIn,
                    data.parkingIn || vehicle.parkingSpot,
                    timestamp,
                    trip.vehicleId
                ]
            });

            await tx.commit();

            // Incident push notification
            if (data.conditionIn === "Problème signalé" || data.incident) {
                try {
                    const { sendPushNotification } = await import('@/lib/onesignal');
                    const vName = vehicle.name || 'Véhicule inconnu';

                    await sendPushNotification({
                        tags: [{ field: "tag", key: "role_RESPO", relation: "=", value: "true" }],
                        headings: { en: `🚨 Incident signalé au retour de ${vName}`, fr: `🚨 Incident signalé au retour de ${vName}` },
                        contents: {
                            en: `Un incident a été signalé lors du retour de ${vName}. Problème: ${data.incident || 'Non spécifié'}`,
                            fr: `Un incident a été signalé lors du retour de ${vName}. Problème: ${data.incident || 'Non spécifié'}`
                        },
                        url: `https://cr-chauffeur.vercel.app/vehicles/${vName}`
                    });
                } catch (pushError) {
                    console.error('Erreur lors de l\'envoi de la notification Push Incident (Retour):', pushError);
                }
            }

            const updatedTrip = {
                ...trip,
                checkInAt: timestamp,
                mileageIn: finalMileageIn,
                fuelIn: finalFuelIn,
                parkingIn: data.parkingIn || null,
                conditionIn: data.conditionIn,
                windowsClosed: data.windowsClosed,
                vehicleInspected: data.vehicleInspected,
                incident: data.incident || null,
                dsaUsed: data.dsaUsed,
                commentsIn: data.commentsIn || null,
                parkingPhoto: data.parkingPhoto || null,
                vehicle: {
                    ...vehicle,
                    status: 'AVAILABLE',
                    mileage: finalMileageIn,
                    fuelLevel: finalFuelIn,
                    parkingSpot: data.parkingIn || vehicle.parkingSpot,
                    updatedAt: timestamp
                }
            };

            return NextResponse.json(updatedTrip);
        } catch (e) {
            await tx.rollback();
            throw e;
        }
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
