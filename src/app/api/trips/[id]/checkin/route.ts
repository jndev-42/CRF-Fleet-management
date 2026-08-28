import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getRenaultVehicleData } from '@/lib/renault';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { checkInSchema } from './schema';
import {
    MAX_KM_PER_DAY,
    checkMileageAnomaly,
    elapsedDays,
    formatElapsed,
    negativeMileageMessage,
} from '@/lib/utils/mileageAnomaly';
// Increase duration limits for Vercel Serverless Functions
export const maxDuration = 30; // 30 seconds max duration

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // 1. Auth check FIRST — before any DB query or body parsing
        const session = await auth();
        const userId = session?.user?.id;

        if (!userId) {
            return unauthorizedResponse();
        }

        const userRoles = session.user.roles || [];
        const isAdmin = isAdminOrAbove(userRoles);

        // 2. Parse & validate body
        const { id } = await params;
        const body = await request.json();
        const data = checkInSchema.parse(body);

        // 3. Fetch trip
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

        // 4. Authorization: only the driver, second driver, or admin can check in
        const isFirstDriver = userId === trip.driverId;
        const isSecondDriver = userId === trip.secondDriverId;

        if (!isAdmin && !isFirstDriver && !isSecondDriver) {
            return forbiddenResponse("Vous n'êtes pas autorisé à rendre ce véhicule. Seul l'emprunteur ou un administrateur peut le faire.");
        }

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
                        finalFuelIn = Math.min(Math.round((rData.fuelQuantity / (Number(vehicle.maxFuelCapacity) || 50)) * 100), 100);
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

        // Contrôle de plausibilité du kilométrage — saisie manuelle uniquement.
        // Invariant : data.mileageIn !== undefined ⇔ saisie manuelle
        // (cf. CheckInModal.tsx et CheckInForm.tsx). Couplage par convention,
        // que rien d'autre ne protège : ne pas remplacer par finalMileageIn,
        // sinon les km remontés par Renault seraient contrôlés eux aussi.
        // trip.mileageOut est NULLABLE en base et Number(null) === 0 : sans le garde,
        // un trip sans km de départ déclencherait un « excessive » systématique.
        if (data.mileageIn !== undefined && trip.mileageOut !== null) {
            const mileageOut = Number(trip.mileageOut);
            const checkOutAt = String(trip.checkOutAt);
            const anomaly = checkMileageAnomaly(data.mileageIn, mileageOut, checkOutAt);

            if (anomaly === 'negative') {
                return NextResponse.json(
                    { error: negativeMileageMessage(mileageOut) },
                    { status: 400 }
                );
            }

            if (anomaly === 'excessive' && !data.confirmMileageAnomaly) {
                return NextResponse.json({
                    error: 'Kilométrage inhabituel, confirmation requise.',
                    code: 'MILEAGE_CONFIRM_REQUIRED',
                    delta: data.mileageIn - mileageOut,
                    maxKm: MAX_KM_PER_DAY * elapsedDays(checkOutAt),
                    durationLabel: formatElapsed(checkOutAt),
                }, { status: 400 });
            }
        }

        // Pour les missions Désinfection (VPSP), le responsable et le numéro de lot sont obligatoires
        if (trip.missionType === 'Désinfection') {
            if (!data.desinfResponsable || !data.desinfLotNumber) {
                return NextResponse.json(
                    { error: 'Le responsable de la désinfection et le numéro de lot sont requis pour une mission Désinfection' },
                    { status: 400 }
                );
            }
        }

        // Pour les véhicules non-VPSP avec suivi de désinfection activé, lot et type sont obligatoires
        if (vehicle.desinfTracking && !(String(vehicle.type || '')).toUpperCase().includes('VPSP')) {
            if (!data.desinfLotNumber || !data.desinfType) {
                return NextResponse.json(
                    { error: 'Le numéro de lot et le type de désinfection sont requis pour ce véhicule (suivi activé)' },
                    { status: 400 }
                );
            }
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
                        incident = ?,
                        commentsIn = ?, parkingPhoto = ?, driveFolderId = ?, checklistIn = ?,
                        renaultDataValidated = ?, renaultLastCheckedAt = ?,
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
                    data.parkingPhoto || null,
                    trip.driveFolderId || data.driveFolderId || null,
                    data.checklistIn ? JSON.stringify(data.checklistIn) : null,
                    renaultDataValidated,
                    renaultDataValidated !== null ? timestamp : null,
                    data.desinfResponsable || null,
                    data.desinfLotNumber || null,
                    data.desinfType || null,
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

            // Pour les missions Désinfection : mise à jour des dates de désinf. du véhicule au retour
            if (trip.missionType === 'Désinfection') {
                await tx.execute({
                    sql: `UPDATE Vehicle SET lastDesinfDate = date('now'), nextDesinfMaxDate = date('now', '+42 days') WHERE id = ?`,
                    args: [trip.vehicleId]
                });
            }

            await tx.commit();

            // Incident push notification (non-blocking, after commit)
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
                        url: `https://cr-chauffeur.vercel.app/vehicles/${encodeURIComponent(String(vName))}`,
                        ulId: vehicle.ulId as string || 'ul-paris-18'
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
                incident: data.incident || null,
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