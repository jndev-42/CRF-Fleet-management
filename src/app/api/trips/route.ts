import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getRenaultVehicleData } from '@/lib/renault';
import { auth } from '@/auth';

const checkOutSchema = z.object({
    vehicleId: z.string().min(1),
    driverName: z.string().min(1, 'Le nom du chauffeur est requis'),
    driverEmail: z.string().email().optional().or(z.literal('')),
    missionType: z.string().min(1, 'Le type de mission est requis'),
    missionName: z.string().optional(),
    conditionOut: z.string().min(1, "L'état du véhicule est requis"),
    cleanlinessOut: z.string().optional(),
    parkingOut: z.string().optional(),
    dsaChecked: z.boolean(),
    commentsOut: z.string().optional(),
    secondDriverName: z.string().optional(),
    secondDriverEmail: z.string().email('Email 2nd conducteur invalide').optional().or(z.literal('')),
    driveFolderId: z.string().optional(),
    checklistOut: z.record(z.string(), z.boolean()).optional(),
    dataIncorrect: z.boolean().optional(),
    correctedMileage: z.number().int().min(0).optional(),
    correctedFuel: z.number().int().min(0).max(100).optional(),
});

export async function POST(request: Request) {
    try {
        // Auth check must happen before any body parsing or DB queries
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json(
                { error: 'Non authentifié' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const data = checkOutSchema.parse(body);

        // Vérifier que le véhicule est disponible
        const vehicleResult = await db.execute({
            sql: `SELECT * FROM Vehicle WHERE id = ?`,
            args: [data.vehicleId]
        });
        const vehicle = vehicleResult.rows[0];

        if (!vehicle) {
            return NextResponse.json(
                { error: 'Véhicule non trouvé' },
                { status: 404 }
            );
        }

        if (vehicle.status !== 'AVAILABLE') {
            return NextResponse.json(
                { error: 'Ce véhicule n\'est pas disponible' },
                { status: 400 }
            );
        }

        // Verify Roles
        const roles = session?.user?.roles || ['GUEST'];
        const isAdmin = roles.includes('ADMIN');
        const isCHVL = roles.includes('CHVL');
        const isCHVPSP = roles.includes('CHVPSP');
        const vehicleType = String(vehicle.type || '');
        const isVPSP = vehicleType.toUpperCase().includes('VPSP');

        let canBorrow = false;
        if (isAdmin) canBorrow = true;
        else if (isCHVPSP) canBorrow = true;
        else if (isCHVL && !isVPSP) canBorrow = true;

        if (!canBorrow) {
            return NextResponse.json(
                { error: 'Vous n\'avez pas les droits pour emprunter ce véhicule' },
                { status: 403 }
            );
        }

        // Fetch live Renault data if vehicle is connected (has a VIN)
        let mileageOut = vehicle.mileage as number;
        let fuelOut = vehicle.fuelLevel as number;
        const vin = vehicle.vin as string | null;

        if (vin) {
            try {
                const rData = await getRenaultVehicleData(vin);
                if (rData.totalMileage !== null) mileageOut = rData.totalMileage;
                if (rData.isElectric && rData.batteryLevel !== null) fuelOut = rData.batteryLevel;
                if (!rData.isElectric && rData.fuelQuantity !== null) {
                    fuelOut = Math.min(Math.round((rData.fuelQuantity / 50) * 100), 100);
                }
            } catch (e) {
                console.error('Failed to get live Renault data during checkout', e);
            }
        }

        // Override with user-reported corrections for non-connected vehicles
        const originalMileage = mileageOut;
        const originalFuel = fuelOut;
        if (data.dataIncorrect) {
            if (data.correctedMileage !== undefined) mileageOut = data.correctedMileage;
            if (data.correctedFuel !== undefined) fuelOut = data.correctedFuel;
        }

        // Créer le trip et mettre à jour le véhicule en transaction
        const tx = await db.transaction('write');
        const tripId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        try {
            await tx.execute({
                sql: `INSERT INTO Trip (
                        id, vehicleId, driverName, driverEmail, missionType, missionName,
                        checkOutAt, mileageOut, fuelOut, conditionOut, cleanlinessOut, parkingOut, dsaChecked, commentsOut,
                        secondDriverName, secondDriverEmail, driveFolderId, checklistOut, createdAt
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    tripId,
                    data.vehicleId,
                    data.driverName,
                    data.driverEmail || null,
                    data.missionType,
                    data.missionName || null,
                    timestamp, // checkOutAt
                    mileageOut,
                    fuelOut,
                    data.conditionOut,
                    data.cleanlinessOut || null,
                    data.parkingOut || (vehicle.parkingSpot as string) || null,
                    data.dsaChecked ? 1 : 0,
                    data.commentsOut || null,
                    data.secondDriverName || null,
                    data.secondDriverEmail || null,
                    data.driveFolderId || null,
                    data.checklistOut ? JSON.stringify(data.checklistOut) : null,
                    timestamp // createdAt
                ]
            });

            await tx.execute({
                sql: `UPDATE Vehicle SET status = 'IN_USE', mileage = ?, fuelLevel = ?, updatedAt = ? WHERE id = ?`,
                args: [mileageOut, fuelOut, timestamp, data.vehicleId]
            });

            // Auto-delete active reservation for this user if they are taking the vehicle they reserved
            if (data.driverEmail) {
                await tx.execute({
                    sql: `DELETE FROM "Reservation" WHERE vehicleId = ? AND userEmail = ? AND startTime <= ? AND endTime >= ?`,
                    args: [data.vehicleId, data.driverEmail, timestamp, timestamp]
                });
            }

            await tx.commit();

            // Incorrect data push notification (non-connected vehicle)
            if (data.dataIncorrect) {
                try {
                    const { sendPushNotification } = await import('@/lib/onesignal');
                    const vName = vehicle.name || 'Véhicule inconnu';
                    const fuelLabel = vehicle.fuelType === 'Électrique' ? 'Batterie' : 'Carburant';

                    await sendPushNotification({
                        tags: [
                            { field: 'tag', key: 'role_RESPO', relation: '=', value: 'true' },
                            { operator: 'OR' },
                            { field: 'tag', key: 'role_ADMIN', relation: '=', value: 'true' },
                        ],
                        headings: { fr: `⚠️ Données incorrectes — ${vName}`, en: `⚠️ Incorrect data — ${vName}` },
                        contents: {
                            fr: `${data.driverName} a signalé des données incorrectes sur ${vName}. Km : ${originalMileage.toLocaleString('fr-FR')} → ${mileageOut.toLocaleString('fr-FR')} km. ${fuelLabel} : ${originalFuel}% → ${fuelOut}%.`,
                            en: `${data.driverName} reported incorrect data on ${vName}. Mileage: ${originalMileage.toLocaleString('fr-FR')} → ${mileageOut.toLocaleString('fr-FR')} km. ${fuelLabel}: ${originalFuel}% → ${fuelOut}%.`,
                        },
                        url: `https://cr-chauffeur.vercel.app/vehicles/${encodeURIComponent(String(vName))}`,
                    });
                } catch (pushError) {
                    console.error('Erreur lors de l\'envoi de la notification données incorrectes:', pushError);
                }
            }

            // Incident push notification
            if (data.conditionOut === "Problème signalé" || data.conditionOut === "Dégradé") {
                try {
                    const { sendPushNotification } = await import('@/lib/onesignal');
                    const vName = vehicle.name || 'Véhicule inconnu';

                    await sendPushNotification({
                        tags: [{ field: "tag", key: "role_RESPO", relation: "=", value: "true" }],
                        headings: { en: `🚨 Incident signalé à la prise de ${vName}`, fr: `🚨 Incident signalé à la prise de ${vName}` },
                        contents: {
                            en: `${data.driverName} a signalé un incident lors de la prise du véhicule ${vName}. État: ${data.conditionOut}`,
                            fr: `${data.driverName} a signalé un incident lors de la prise du véhicule ${vName}. État: ${data.conditionOut}`
                        },
                        url: `https://cr-chauffeur.vercel.app/vehicles/${encodeURIComponent(String(vName))}`
                    });
                } catch (pushError) {
                    console.error('Erreur lors de l\'envoi de la notification Push Incident:', pushError);
                }
            }

            const trip = {
                id: tripId,
                vehicleId: data.vehicleId,
                driverName: data.driverName,
                driverEmail: data.driverEmail || null,
                missionType: data.missionType,
                missionName: data.missionName || null,
                checkOutAt: timestamp,
                mileageOut,
                fuelOut,
                conditionOut: data.conditionOut,
                parkingOut: data.parkingOut || vehicle.parkingSpot,
                dsaChecked: data.dsaChecked,
                commentsOut: data.commentsOut || null,
                secondDriverName: data.secondDriverName || null,
                secondDriverEmail: data.secondDriverEmail || null,
                driveFolderId: data.driveFolderId || null,
                checklistOut: data.checklistOut || null,
                createdAt: timestamp,
                vehicle: { ...vehicle, status: 'IN_USE', mileage: mileageOut, fuelLevel: fuelOut, updatedAt: timestamp }
            };

            return NextResponse.json(trip, { status: 201 });
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
        console.error('Error creating trip:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la prise du véhicule' },
            { status: 500 }
        );
    }
}
