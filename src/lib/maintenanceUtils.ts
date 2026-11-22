import type { MaintenanceRecord } from '@/app/vehicles/[id]/types';

interface VehicleForCt {
    type: string;
    firstRegistrationDate: string | null;
}

interface VehicleForRevision {
    mileage: number;
    firstRegistrationDate: string | null;
    revisionKmInterval: number | null;
    revisionYearInterval: number | null;
}

/**
 * Calcule la date du prochain contrôle technique.
 *
 * Règles :
 * - VPSP (type contient 'VPSP') : dernier CT + 1 an ; sans historique → première immat + 1 an
 * - VL : dernier CT + 2 ans ; sans historique → première immat + 4 ans
 *
 * Retourne null si aucune date de référence disponible.
 */
export function getNextCtDate(
    vehicle: VehicleForCt,
    records: MaintenanceRecord[]
): Date | null {
    const isVpsp = vehicle.type.toUpperCase().includes('VPSP');
    const intervalYears = isVpsp ? 1 : 2;
    const initialOffsetYears = isVpsp ? 1 : 4;

    // Filter records that include a CT
    const ctRecords = records.filter(r => r.type === 'CT' || r.type === 'CT_REVISION');
    ctRecords.sort((a, b) => a.date.localeCompare(b.date));

    if (ctRecords.length > 0) {
        const lastCt = ctRecords[ctRecords.length - 1];
        const base = new Date(lastCt.date);
        base.setFullYear(base.getFullYear() + intervalYears);
        return base;
    }

    if (vehicle.firstRegistrationDate) {
        const base = new Date(vehicle.firstRegistrationDate);
        base.setFullYear(base.getFullYear() + initialOffsetYears);
        return base;
    }

    return null;
}

/**
 * Calcule la prochaine révision selon les intervalles configurés.
 *
 * Règle : la première limite atteinte (date OU km) déclenche la révision.
 * Utilise le dernier enregistrement de type REVISION ou CT_REVISION comme point de départ.
 * Sans historique de révision, utilise la date de première immatriculation.
 *
 * Retourne null si aucune règle n'est configurée (revisionKmInterval et revisionYearInterval
 * sont tous les deux null).
 */
export function getNextRevision(
    vehicle: VehicleForRevision,
    records: MaintenanceRecord[]
): { nextDate: Date; remainingKm: number } | null {
    const { revisionKmInterval, revisionYearInterval } = vehicle;

    if (revisionKmInterval === null && revisionYearInterval === null) {
        return null;
    }

    // Find last revision record (REVISION or CT_REVISION)
    const revisionRecords = records.filter(r => r.type === 'REVISION' || r.type === 'CT_REVISION');
    revisionRecords.sort((a, b) => a.date.localeCompare(b.date));
    const lastRevision = revisionRecords.length > 0 ? revisionRecords[revisionRecords.length - 1] : null;

    // Base date: last revision date or first registration date
    let baseDate: Date | null = null;
    if (lastRevision) {
        baseDate = new Date(lastRevision.date);
    } else if (vehicle.firstRegistrationDate) {
        baseDate = new Date(vehicle.firstRegistrationDate);
    }

    // Base mileage: last revision mileage or current vehicle mileage as reference
    const baseMileage = lastRevision?.mileage ?? null;

    // Calculate next date from year interval
    let nextDate: Date | null = null;
    if (revisionYearInterval !== null && baseDate !== null) {
        nextDate = new Date(baseDate);
        nextDate.setFullYear(nextDate.getFullYear() + revisionYearInterval);
    }

    // Calculate remaining km from km interval
    let remainingKm = Infinity;
    if (revisionKmInterval !== null && baseMileage !== null) {
        remainingKm = revisionKmInterval - (vehicle.mileage - baseMileage);
    } else if (revisionKmInterval !== null && baseMileage === null) {
        // No base mileage — use full interval as remaining
        remainingKm = revisionKmInterval;
    }

    // We need at least a date to return
    if (nextDate === null && remainingKm === Infinity) {
        return null;
    }

    const today = new Date();
    const resolvedDate = nextDate ?? today;
    const resolvedRemainingKm = remainingKm === Infinity ? 0 : Math.round(remainingKm);

    return {
        nextDate: resolvedDate,
        remainingKm: resolvedRemainingKm,
    };
}

/**
 * Formate un nombre de jours en chaîne lisible en français :
 * - < 30 jours → "X jour(s)"
 * - < 365 jours → "X mois"
 * - >= 365 jours → "X an(s) et Y mois" (Y=0 est omis)
 */
export function formatDuration(days: number): string {
    const absDays = Math.abs(days);

    if (absDays < 30) {
        return `${absDays} jour${absDays > 1 ? 's' : ''}`;
    }

    if (absDays < 365) {
        const months = Math.floor(absDays / 30);
        return `${months} mois`;
    }

    const years = Math.floor(absDays / 365);
    const remainingDays = absDays - years * 365;
    const months = Math.floor(remainingDays / 30);

    const yearStr = `${years} an${years > 1 ? 's' : ''}`;
    if (months === 0) {
        return yearStr;
    }
    return `${yearStr} et ${months} mois`;
}

/**
 * Affichage de la prochaine révision, sans valeur inventée :
 * - la date n'existe que si un intervalle en années est configuré et qu'une base est connue
 *   (dernière révision, sinon première immatriculation) ;
 * - les km restants n'existent que si un intervalle en km est configuré et qu'une révision
 *   avec kilométrage connu existe.
 *
 * Retourne null si aucun des deux n'est calculable. N'altère pas `getNextRevision`.
 */
export function getRevisionDisplay(
    vehicle: VehicleForRevision,
    records: MaintenanceRecord[]
): { nextDate: Date | null; remainingKm: number | null } | null {
    const { revisionKmInterval, revisionYearInterval } = vehicle;

    const revisionRecords = records
        .filter(r => r.type === 'REVISION' || r.type === 'CT_REVISION')
        .sort((a, b) => a.date.localeCompare(b.date));
    const lastRevision = revisionRecords.length > 0 ? revisionRecords[revisionRecords.length - 1] : null;

    let nextDate: Date | null = null;
    if (revisionYearInterval !== null) {
        const base = lastRevision
            ? new Date(lastRevision.date)
            : vehicle.firstRegistrationDate ? new Date(vehicle.firstRegistrationDate) : null;
        if (base) {
            nextDate = new Date(base);
            nextDate.setFullYear(nextDate.getFullYear() + revisionYearInterval);
        }
    }

    let remainingKm: number | null = null;
    if (revisionKmInterval !== null && lastRevision && lastRevision.mileage !== null && lastRevision.mileage !== undefined) {
        remainingKm = Math.round(revisionKmInterval - (vehicle.mileage - lastRevision.mileage));
    }

    if (nextDate === null && remainingKm === null) return null;
    return { nextDate, remainingKm };
}

/** Seuil de carburant au retour appliqué quand l'UL n'en a pas défini. */
export const DEFAULT_MIN_FUEL_RETURN_PERCENT = 25;

const FUEL_FRACTIONS: Record<number, string> = { 25: '1/4', 50: '1/2', 75: '3/4' };

/** « 50 % (1/2) » ; la fraction n'est affichée que pour 25, 50 et 75. */
export function fuelThresholdLabel(percent: number): string {
    const fraction = FUEL_FRACTIONS[percent];
    return fraction ? `${percent} % (${fraction})` : `${percent} %`;
}
