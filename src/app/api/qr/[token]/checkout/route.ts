import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { getRenaultVehicleData, isConnectedInDb } from '@/lib/vehicle-connection';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { secondDriverError } from '@/lib/eligibleDrivers';
import { MILEAGE_DECREASE_CONFIRM_REQUIRED, isMileageDecrease, mileageDecreaseMessage } from '@/lib/utils/mileageAnomaly';

/**
 * POST /api/qr/[token]/checkout
 *
 * Creates a trip (checkout) for the vehicle identified by a QR token.
 * Access : tout compte CRF connecté, avec ou sans rôle attribué, sauf s'il porte
 * INACTIF (ou GUEST) — cf. `isQrBlocked`. Aucun contrôle d'UL ni de rôle chauffeur.
 */

const checkOutSchema = z.object({
    missionType: z.string().min(1, 'Le type de mission est requis'),
    missionName: z.string().optional(),
    conditionOut: z.string().min(1, "L'état du véhicule est requis"),
    cleanlinessOut: z.string().optional(),
    parkingOut: z.string().optional(),
    dsaChecked: z.boolean().default(false),
    commentsOut: z.string().optional(),
    checklistOut: z.record(z.string(), z.boolean()).optional(),
    secondDriverId: z.string().min(1).optional(),
    dataIncorrect: z.boolean().optional(),
    correctedMileage: z.number().int().min(0).optional(),
    correctedFuel: z.number().int().min(0).max(100).optional(),
    /** Confirmation explicite d'un kilométrage corrigé à la baisse (cf. mileageAnomaly.ts). */
    confirmMileageDecrease: z.boolean().optional(),
});

async function postHandler(
    request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        if (isQrBlocked(session.user.roles || [])) {
            return forbiddenResponse('Compte inactif — accès refusé');
        }

        const { token } = await params;
        const body = await request.json();
        const data = checkOutSchema.parse(body);

        // Resolve token → vehicle
        //
        // AUCUN CLOISONNEMENT UL ICI, ET C'EST VOLONTAIRE. La possession physique du QR
        // code fait foi : le bénévole qui scanne la vignette d'un véhicule en renfort sur
        // une autre unité locale doit pouvoir le prendre. C'est le seul parcours d'emprunt
        // inter-UL légitime du produit — `POST /api/trips` applique, lui, un cloisonnement
        // strict (404 inter-UL, `isOutsideUl` de `@/lib/apiAuth`), et les deux routes sont
        // indépendantes : celle-ci fait son propre INSERT Trip et son propre UPDATE Vehicle.
        //
        // Ne pas « harmoniser » les deux : le verrou de comportement est
        // `src/__tests__/integration/qr.test.ts` → « l'emprunt QR reste ouvert entre unités
        // locales (bypass volontaire des droits) ». Seul le verrou maintenance ci-dessous
        // restreint ce parcours.
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

        // Verrou maintenance — copie de `src/app/api/trips/route.ts:55-66`.
        // `Vehicle.status` ne suffit pas : une maintenance datée du futur n'y est jamais
        // projetée, et tout check-in réécrit la colonne à 'AVAILABLE'. On interroge donc
        // directement `VehicleMaintenance`, hors transaction.
        const maintNowISO = new Date().toISOString();
        const maintTodayDate = maintNowISO.split('T')[0];
        const maintCheck = await db.execute({
            sql: `SELECT 1 FROM "VehicleMaintenance"
                  WHERE vehicleId = ?
                    AND ((startDate LIKE '%T%' AND startDate <= ?) OR (startDate NOT LIKE '%T%' AND startDate <= ?))
                    AND (endDate IS NULL OR (endDate LIKE '%T%' AND endDate > ?) OR (endDate NOT LIKE '%T%' AND endDate >= ?))
                  LIMIT 1`,
            args: [vehicle.id as string, maintNowISO, maintTodayDate, maintNowISO, maintTodayDate],
        });
        if (maintCheck.rows.length > 0) {
            return NextResponse.json({ error: 'Ce véhicule est en maintenance' }, { status: 400 });
        }

        // Fetch live Renault data if connected
        let mileageOut = vehicle.mileage as number;
        let fuelOut = vehicle.fuelLevel as number;
        const connectedVehicleId = vehicle.id as string;

        if (await isConnectedInDb(connectedVehicleId)) {
            try {
                const rData = await getRenaultVehicleData(connectedVehicleId);
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
        const originalMileage = mileageOut;
        const originalFuel = fuelOut;
        if (data.dataIncorrect) {
            if (
                data.correctedMileage !== undefined
                && isMileageDecrease(data.correctedMileage, originalMileage)
                && !data.confirmMileageDecrease
            ) {
                return NextResponse.json({
                    error: mileageDecreaseMessage(originalMileage, data.correctedMileage),
                    code: MILEAGE_DECREASE_CONFIRM_REQUIRED,
                    knownMileage: originalMileage,
                }, { status: 400 });
            }
            if (data.correctedMileage !== undefined) mileageOut = data.correctedMileage;
            if (data.correctedFuel !== undefined) fuelOut = data.correctedFuel;
        }

        const driverId = session.user.id;
        const vehicleId = vehicle.id as string;

        // 2ème conducteur : chauffeur actif habilité, distinct de l'emprunteur. Il pourra
        // ensuite rendre le véhicule (check-in réservé aux conducteurs du trajet).
        const secondDriverId = data.secondDriverId ?? null;
        if (secondDriverId) {
            const secondDriverMessage = await secondDriverError(vehicle.type, driverId, secondDriverId);
            if (secondDriverMessage) {
                return NextResponse.json({ error: secondDriverMessage }, { status: 400 });
            }
        }
        const tripId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        const tx = await db.transaction('write');
        try {
            await tx.execute({
                sql: `INSERT INTO Trip (
                        id, vehicleId, driverId, secondDriverId, missionType, missionName,
                        checkOutAt, mileageOut, fuelOut, conditionOut, cleanlinessOut,
                        parkingOut, dsaChecked, commentsOut, checklistOut, createdAt
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    tripId,
                    vehicleId,
                    driverId,
                    secondDriverId,
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
                    data.checklistOut ? JSON.stringify(data.checklistOut) : null,
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

        // Notification « données incorrectes », reprise de `POST /api/trips` — uniquement si
        // la correction change réellement une valeur.
        if (data.dataIncorrect && (mileageOut !== originalMileage || fuelOut !== originalFuel)) {
            try {
                const { sendPushNotification } = await import('@/lib/push');
                const vName = vehicle.name || 'Véhicule inconnu';
                const fuelLabel = vehicle.fuelType === 'Électrique' ? 'Batterie' : 'Carburant';
                const driverDisplayName = session.user.name || session.user.email || 'Chauffeur inconnu';

                await sendPushNotification({
                    roles: ['PRESIDENT', 'CADRE', 'ADMIN'],
                    headings: { fr: `⚠️ Données incorrectes — ${vName}`, en: `⚠️ Incorrect data — ${vName}` },
                    contents: {
                        fr: `${driverDisplayName} a signalé des données incorrectes sur ${vName}. Km : ${originalMileage.toLocaleString('fr-FR')} → ${mileageOut.toLocaleString('fr-FR')} km. ${fuelLabel} : ${originalFuel}% → ${fuelOut}%.`,
                        en: `${driverDisplayName} reported incorrect data on ${vName}. Mileage: ${originalMileage.toLocaleString('fr-FR')} → ${mileageOut.toLocaleString('fr-FR')} km. ${fuelLabel}: ${originalFuel}% → ${fuelOut}%.`,
                    },
                    url: `/vehicles/${encodeURIComponent(String(vName))}`,
                    ulId: vehicle.ulId as string || 'ul-paris-18',
                    excludeUserId: session.user.id,
                });
            } catch (pushError) {
                console.error('Erreur lors de l\'envoi de la notification données incorrectes:', pushError);
            }
        }

        // Alerte « incident à la prise » — même règle que `POST /api/trips` : un véhicule
        // emprunté par QR code en état dégradé doit prévenir les responsables de son UL.
        if (data.conditionOut === 'Problème signalé' || data.conditionOut === 'Dégradé') {
            try {
                const { sendPushNotification } = await import('@/lib/push');
                const vName = vehicle.name || 'Véhicule inconnu';
                const driverDisplayName = session.user.name || session.user.email || 'Chauffeur inconnu';

                await sendPushNotification({
                    roles: ['PRESIDENT', 'CADRE'],
                    headings: { en: `🚨 Incident signalé à la prise de ${vName}`, fr: `🚨 Incident signalé à la prise de ${vName}` },
                    contents: {
                        en: `${driverDisplayName} a signalé un incident lors de la prise du véhicule ${vName}. État: ${data.conditionOut}`,
                        fr: `${driverDisplayName} a signalé un incident lors de la prise du véhicule ${vName}. État: ${data.conditionOut}`,
                    },
                    url: `/vehicles/${encodeURIComponent(String(vName))}`,
                    ulId: vehicle.ulId as string || 'ul-paris-18',
                    excludeUserId: session.user.id,
                });
            } catch (pushError) {
                console.error('Erreur lors de l\'envoi de la notification Push Incident:', pushError);
            }
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

export const POST = withAudit(postHandler, { action: "Prise d'un véhicule via QR code", entityType: 'trip' });
