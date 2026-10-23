import { getRenaultVehicleData, isConnectedInDb } from '@/lib/vehicle-connection';
import { MILEAGE_DECREASE_CONFIRM_REQUIRED, isMileageDecrease, mileageDecreaseMessage } from '@/lib/utils/mileageAnomaly';
import { ROLES } from '@/lib/roles';

/**
 * Règles communes aux deux parcours d'emprunt — `POST /api/trips` (fiche véhicule) et
 * `POST /api/qr/[token]/checkout` (QR code). Les deux routes restent indépendantes pour
 * l'accès (cloisonnement UL, rôles, réservations) mais partagent ici ce qui doit être
 * identique : kilométrage/carburant de départ, correction déclarée, alertes.
 */

/** Ligne `Vehicle` telle que lue par les routes (`SELECT *`). */
export type CheckoutVehicle = Record<string, unknown>;

export interface CheckoutLevels {
    mileage: number;
    fuel: number;
}

/**
 * Kilométrage et carburant connus au départ : valeurs stockées, remplacées par la
 * télémétrie si le véhicule est connecté. Une erreur de télémétrie n'est pas bloquante.
 */
export async function readCheckoutBaseline(vehicle: CheckoutVehicle): Promise<CheckoutLevels> {
    let mileage = vehicle.mileage as number;
    let fuel = vehicle.fuelLevel as number;
    const vehicleId = vehicle.id as string;

    if (await isConnectedInDb(vehicleId)) {
        try {
            const rData = await getRenaultVehicleData(vehicleId);
            if (rData.totalMileage !== null) mileage = rData.totalMileage;
            if (rData.isElectric && rData.batteryLevel !== null) fuel = rData.batteryLevel;
            if (!rData.isElectric && rData.fuelQuantity !== null) {
                fuel = Math.min(Math.round((rData.fuelQuantity / (Number(vehicle.maxFuelCapacity) || 50)) * 100), 100);
            }
        } catch (e) {
            console.error('Failed to get live Renault data during checkout:', e);
        }
    }

    return { mileage, fuel };
}

export interface CheckoutCorrectionInput {
    dataIncorrect?: boolean;
    correctedMileage?: number;
    correctedFuel?: number;
    confirmMileageDecrease?: boolean;
}

export type CheckoutCorrectionResult =
    | { ok: true; levels: CheckoutLevels }
    | { ok: false; body: { error: string; code: string; knownMileage: number } };

/**
 * Applique la correction déclarée (« le kilométrage et/ou le niveau est erroné ») au
 * point de départ. Un kilométrage corrigé à la baisse exige `confirmMileageDecrease` :
 * sinon le résultat porte le corps du 400 `MILEAGE_DECREASE_CONFIRM_REQUIRED`.
 */
export function applyCheckoutCorrection(baseline: CheckoutLevels, input: CheckoutCorrectionInput): CheckoutCorrectionResult {
    if (!input.dataIncorrect) return { ok: true, levels: { ...baseline } };

    if (
        input.correctedMileage !== undefined
        && isMileageDecrease(input.correctedMileage, baseline.mileage)
        && !input.confirmMileageDecrease
    ) {
        return {
            ok: false,
            body: {
                error: mileageDecreaseMessage(baseline.mileage, input.correctedMileage),
                code: MILEAGE_DECREASE_CONFIRM_REQUIRED,
                knownMileage: baseline.mileage,
            },
        };
    }

    return {
        ok: true,
        levels: {
            mileage: input.correctedMileage ?? baseline.mileage,
            fuel: input.correctedFuel ?? baseline.fuel,
        },
    };
}

/** États déclarés au départ qui déclenchent l'alerte « incident à la prise ». */
export const CHECKOUT_INCIDENT_CONDITIONS = ['Dégradé', 'Problème signalé'];

export interface CheckoutAlertsInput {
    vehicle: CheckoutVehicle;
    user: { id?: string; name?: string | null; email?: string | null };
    conditionOut: string;
    baseline: CheckoutLevels;
    levels: CheckoutLevels;
}

/**
 * Alertes envoyées après l'emprunt (transaction validée), non bloquantes :
 *  - « Données incorrectes » (PRESIDENT, RESP_VEHICULE, ADMIN) si la correction change une valeur ;
 *  - « Incident signalé à la prise » (PRESIDENT, RESP_VEHICULE) si l'état est dégradé.
 * Toujours ciblées sur l'UL du véhicule, l'auteur exclu.
 */
export async function sendCheckoutAlerts({ vehicle, user, conditionOut, baseline, levels }: CheckoutAlertsInput): Promise<void> {
    const corrected = levels.mileage !== baseline.mileage || levels.fuel !== baseline.fuel;
    const incident = CHECKOUT_INCIDENT_CONDITIONS.includes(conditionOut);
    if (!corrected && !incident) return;

    let sendPushNotification: typeof import('@/lib/push').sendPushNotification;
    try {
        ({ sendPushNotification } = await import('@/lib/push'));
    } catch (importError) {
        console.error('Notifications indisponibles après un emprunt:', importError);
        return;
    }
    const vName = String(vehicle.name || 'Véhicule inconnu');
    const driverDisplayName = user.name || user.email || 'Chauffeur inconnu';
    const target = {
        url: `/vehicles/${encodeURIComponent(vName)}`,
        ulId: (vehicle.ulId as string) || 'ul-paris-18',
        excludeUserId: user.id,
    };

    if (corrected) {
        try {
            const fuelLabel = vehicle.fuelType === 'Électrique' ? 'Batterie' : 'Carburant';
            const km = (n: number) => n.toLocaleString('fr-FR');
            await sendPushNotification({
                roles: ['PRESIDENT', ROLES.RESP_VEHICULE, 'ADMIN'],
                headings: { fr: `⚠️ Données incorrectes — ${vName}`, en: `⚠️ Incorrect data — ${vName}` },
                contents: {
                    fr: `${driverDisplayName} a signalé des données incorrectes sur ${vName}. Km : ${km(baseline.mileage)} → ${km(levels.mileage)} km. ${fuelLabel} : ${baseline.fuel}% → ${levels.fuel}%.`,
                    en: `${driverDisplayName} reported incorrect data on ${vName}. Mileage: ${km(baseline.mileage)} → ${km(levels.mileage)} km. ${fuelLabel}: ${baseline.fuel}% → ${levels.fuel}%.`,
                },
                ...target,
            });
        } catch (pushError) {
            console.error('Erreur lors de l\'envoi de la notification données incorrectes:', pushError);
        }
    }

    if (incident) {
        try {
            const message = `${driverDisplayName} a signalé un incident lors de la prise du véhicule ${vName}. État: ${conditionOut}`;
            await sendPushNotification({
                roles: ['PRESIDENT', ROLES.RESP_VEHICULE],
                headings: { en: `🚨 Incident signalé à la prise de ${vName}`, fr: `🚨 Incident signalé à la prise de ${vName}` },
                contents: { en: message, fr: message },
                ...target,
            });
        } catch (pushError) {
            console.error('Erreur lors de l\'envoi de la notification Push Incident:', pushError);
        }
    }
}
