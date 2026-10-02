/**
 * Disponibilité d'un véhicule en Vue DT, à l'instant présent ou sur une période.
 *
 * Règle métier pure (sans I/O), seule source de vérité du statut renvoyé par
 * `GET /api/vehicles?view=dt`. Distincte de `computeEffectiveStatus` (Vue UL) :
 * elle tient compte des réservations et de la fenêtre demandée.
 */
import { z } from 'zod';

export type DtAvailabilityStatus = 'AVAILABLE' | 'POTENTIAL' | 'RESERVED' | 'IN_USE' | 'MAINTENANCE';

/** Ordre d'affichage des statuts (du plus libre au plus bloquant). */
export const DT_AVAILABILITY_STATUSES: DtAvailabilityStatus[] = ['AVAILABLE', 'POTENTIAL', 'RESERVED', 'IN_USE', 'MAINTENANCE'];

export interface DtReservation {
    id: string;
    startTime: string;
    endTime: string;
    userName: string;
    status: 'PENDING' | 'VALIDATED';
    reason: string | null;
}

export interface DtMaintenance {
    /** ISO avec heure, ou date seule `YYYY-MM-DD` (journée entière). */
    startDate: string;
    /** `null` = maintenance sans date de fin. */
    endDate: string | null;
}

export interface DtOpenTrip {
    checkOutAt: string;
}

export interface DtAvailability {
    status: DtAvailabilityStatus;
    /** Début du trajet en cours (`checkOutAt`), `null` sans trajet ouvert. */
    missionSince: string | null;
    /** Réservations PENDING / VALIDATED qui chevauchent la fenêtre, triées par début. */
    reservations: DtReservation[];
}

export interface DtWindow {
    /** Début effectif : jamais avant maintenant (période entamée tronquée). */
    start: Date;
    end: Date;
    /** `true` en mode Maintenant (fenêtre réduite à l'instant `start === end`). */
    isNow: boolean;
    /** `true` si la période demandée avait commencé avant maintenant. */
    truncated: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const DT_MAX_WINDOW_DAYS = 31;

const isDateOnly = (value: string) => !value.includes('T');

/**
 * Bornes d'une maintenance en millisecondes. Une date sans heure couvre la journée entière
 * (même convention « jour UTC » que la liste des véhicules : `startDate <= aujourd'hui` /
 * `endDate >= aujourd'hui`).
 */
function maintenanceBounds(m: DtMaintenance): [number, number] {
    const start = isDateOnly(m.startDate)
        ? Date.parse(`${m.startDate}T00:00:00.000Z`)
        : Date.parse(m.startDate);
    let end = Number.POSITIVE_INFINITY;
    if (m.endDate) {
        end = isDateOnly(m.endDate)
            ? Date.parse(`${m.endDate}T00:00:00.000Z`) + DAY_MS
            : Date.parse(m.endDate);
    }
    return [start, end];
}

/**
 * Chevauchement d'un intervalle [start, end[ avec la fenêtre. Fenêtre instantanée :
 * l'intervalle doit contenir l'instant. Période : `start < fin AND end > début`, comme
 * le contrôle de conflit des réservations — une réservation qui finit pile au début
 * de la fenêtre ne la chevauche pas.
 */
function overlaps(start: number, end: number, windowStart: number, windowEnd: number): boolean {
    if (windowStart === windowEnd) return start <= windowStart && end > windowStart;
    return start < windowEnd && end > windowStart;
}

/**
 * Statut d'un véhicule sur la fenêtre. Priorité : Maintenance > En mission > Réservé >
 * Potentiellement disponible > Disponible.
 *
 * Un trajet ouvert vaut « En mission » si la fenêtre inclut maintenant, et « Potentiellement
 * disponible » si elle est entièrement future (le retour n'a simplement pas été saisi).
 */
export function computeVehicleAvailability(input: {
    reservations: DtReservation[];
    maintenances: DtMaintenance[];
    openTrip: DtOpenTrip | null;
    windowStart: Date;
    windowEnd: Date;
    now: Date;
}): DtAvailability {
    const ws = input.windowStart.getTime();
    const we = input.windowEnd.getTime();

    const reservations = input.reservations
        .filter((r) => r.status === 'PENDING' || r.status === 'VALIDATED')
        .filter((r) => overlaps(Date.parse(r.startTime), Date.parse(r.endTime), ws, we))
        .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));

    const inMaintenance = input.maintenances.some((m) => {
        const [start, end] = maintenanceBounds(m);
        return overlaps(start, end, ws, we);
    });

    const missionSince = input.openTrip ? input.openTrip.checkOutAt : null;
    const windowIncludesNow = ws <= input.now.getTime();

    let status: DtAvailabilityStatus = 'AVAILABLE';
    if (inMaintenance) status = 'MAINTENANCE';
    else if (input.openTrip && windowIncludesNow) status = 'IN_USE';
    else if (reservations.length > 0) status = 'RESERVED';
    else if (input.openTrip) status = 'POTENTIAL';

    return { status, missionSince, reservations };
}

const isoDateTime = z.iso.datetime({ offset: true, error: 'Date invalide : format ISO attendu' });

export type DtWindowResult =
    | { ok: true; window: DtWindow }
    | { ok: false; error: string; code: 'MISSING' | 'INVALID' | 'ORDER' | 'PAST' | 'TOO_LONG' };

/**
 * Valide les paramètres `from` / `to` de la Vue DT. Sans aucun des deux : mode Maintenant.
 * Une période entamée est tronquée à maintenant (`truncated`).
 */
export function parseDtWindow(from: string | null, to: string | null, now: Date): DtWindowResult {
    if (!from && !to) {
        return { ok: true, window: { start: now, end: now, isNow: true, truncated: false } };
    }
    if (!from || !to) {
        return { ok: false, code: 'MISSING', error: 'Le début et la fin de la période sont requis ensemble.' };
    }
    const parsed = z.object({ from: isoDateTime, to: isoDateTime }).safeParse({ from, to });
    if (!parsed.success) {
        return { ok: false, code: 'INVALID', error: parsed.error.issues[0]?.message ?? 'Date invalide' };
    }
    const start = new Date(parsed.data.from);
    const end = new Date(parsed.data.to);
    if (end.getTime() <= start.getTime()) {
        return { ok: false, code: 'ORDER', error: 'La fin doit être après le début.' };
    }
    if (end.getTime() <= now.getTime()) {
        return {
            ok: false,
            code: 'PAST',
            error: 'Cette période est terminée. Les disponibilités ne concernent que le présent et l’avenir.',
        };
    }
    const truncated = start.getTime() < now.getTime();
    const effectiveStart = truncated ? now : start;
    // Durée mesurée sur la fenêtre effective : une période entamée n'est comptée qu'à partir de maintenant.
    if (end.getTime() - effectiveStart.getTime() > DT_MAX_WINDOW_DAYS * DAY_MS) {
        return { ok: false, code: 'TOO_LONG', error: `Période limitée à ${DT_MAX_WINDOW_DAYS} jours.` };
    }
    return { ok: true, window: { start: effectiveStart, end, isNow: false, truncated } };
}

const KNOWN_TYPES = ['VPSP', 'VL', 'Utilitaire', 'Moto'];
export const NO_VEHICLE_TYPE = 'Sans type';

/**
 * Libellé de regroupement d'un type de véhicule : espaces superflus retirés, insensible
 * à la casse. Les types connus gardent leur graphie canonique, les autres passent en
 * majuscules pour que « minibus » et « Minibus » tombent dans la même puce.
 */
export function normalizeVehicleType(type: string | null | undefined): string {
    const collapsed = (type ?? '').trim().replace(/\s+/g, ' ');
    if (!collapsed) return NO_VEHICLE_TYPE;
    const known = KNOWN_TYPES.find((k) => k.toUpperCase() === collapsed.toUpperCase());
    return known ?? collapsed.toUpperCase();
}

/** Ordre des puces de type : types connus, puis les autres par ordre alphabétique, puis « Sans type ». */
export function compareVehicleTypes(a: string, b: string): number {
    const rank = (t: string) => {
        if (t === NO_VEHICLE_TYPE) return KNOWN_TYPES.length + 1;
        const i = KNOWN_TYPES.indexOf(t);
        return i === -1 ? KNOWN_TYPES.length : i;
    };
    return rank(a) - rank(b) || a.localeCompare(b, 'fr');
}
