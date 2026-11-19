import { z } from 'zod';
import { getNextCtDate, getNextRevision } from '@/lib/maintenanceUtils';
import type { MaintenanceRecord } from '@/app/vehicles/[id]/types';
import { isValidIsoDate } from './tasks';

/**
 * Contrôles à échéance du suivi technique (livrable 4, CAP-10) — module **pur**
 * (client-safe), réutilisé par la vue d'ensemble (livrable 5).
 *
 * Les échéances sont LUES depuis les données véhicule, jamais ressaisies :
 *   - CT : `getNextCtDate` ;
 *   - révision : `getNextRevision` (date ; kilométrage restant si un intervalle km est configuré) ;
 *   - désinfection : `Vehicle.nextDesinfMaxDate` des véhicules dont `desinfTracking` est actif.
 * Seul le rendez-vous est saisi ici (`FleetControlAppointment`). Jours comparés en
 * calendrier Europe/Paris (`YYYY-MM-DD`).
 */

export const CONTROL_TYPES = ['CT', 'REVISION', 'DESINFECTION'] as const;
export type ControlType = typeof CONTROL_TYPES[number];

export const CONTROL_TYPE_LABELS: Record<ControlType, string> = {
    CT: 'Contrôle technique',
    REVISION: 'Révision',
    DESINFECTION: 'Désinfection VPSP',
};

/** Libellé court, pour un titre de tâche (« Rendez-vous contrôle technique — 75-184 »). */
export const CONTROL_TYPE_TASK_LABELS: Record<ControlType, string> = {
    CT: 'contrôle technique',
    REVISION: 'révision',
    DESINFECTION: 'désinfection',
};

export const CONTROL_STATES = ['SCHEDULED', 'OVERDUE', 'TO_SCHEDULE'] as const;
export type ControlState = typeof CONTROL_STATES[number];

export const CONTROL_STATE_LABELS: Record<ControlState, string> = {
    SCHEDULED: 'RDV fixé',
    OVERDUE: 'Dépassée',
    TO_SCHEDULE: 'À dater',
};

/** Seuil « Sous 30 jours » (dépassées comprises). */
export const CONTROL_SOON_DAYS = 30;
export const MAX_APPOINTMENT_NOTES = 500;
/** Un rendez-vous se fixe d'aujourd'hui à aujourd'hui + 5 ans (jours Europe/Paris). */
export const MAX_APPOINTMENT_YEARS = 5;

export const CONTROL_FILTERS = ['all', 'to_schedule', 'soon', 'overdue', 'scheduled'] as const;
export type ControlFilter = typeof CONTROL_FILTERS[number];

export const CONTROL_FILTER_LABELS: Record<ControlFilter, string> = {
    all: 'Toutes',
    to_schedule: 'À dater',
    soon: 'Sous 30 jours',
    overdue: 'Dépassées',
    scheduled: 'RDV fixé',
};

// ── Entrées ──────────────────────────────────────────────────────

export interface ControlVehicle {
    id: string;
    name: string;
    plate: string | null;
    type: string;
    mileage: number;
    firstRegistrationDate: string | null;
    revisionKmInterval: number | null;
    revisionYearInterval: number | null;
    desinfTracking: boolean;
    nextDesinfMaxDate: string | null;
}

export interface ControlAppointment {
    id: string;
    vehicleId: string;
    controlType: ControlType;
    /** `YYYY-MM-DD`. */
    appointmentDate: string;
    contactId: string | null;
    /** Nom du garage, `null` si aucun contact ou s'il n'est plus visible depuis l'UL. */
    contactName: string | null;
    notes: string | null;
    /** Tâche créée avec le rendez-vous, `null` si aucune ou si elle n'existe plus. */
    taskId: string | null;
}

// ── Sortie ───────────────────────────────────────────────────────

export interface ControlRow {
    /** `<vehicleId>:<controlType>`. */
    key: string;
    vehicle: { id: string; name: string; plate: string | null; type: string };
    controlType: ControlType;
    /** Échéance calculée, `YYYY-MM-DD` (jour Europe/Paris). */
    dueDate: string;
    /** Jours jusqu'à l'échéance (négatif : dépassée). */
    daysUntilDue: number;
    /** Kilomètres restants avant révision, `null` si non applicable ou inconnu. */
    remainingKm: number | null;
    /** Rendez-vous saisi (futur ou passé), ou `null`. */
    appointment: ControlAppointment | null;
    /** Le rendez-vous saisi est-il passé (il ne compte plus comme fixé) ? */
    appointmentPast: boolean;
    state: ControlState;
    /**
     * Échéance ≤ aujourd'hui + 30 j (dépassées comprises) ou révision au kilométrage
     * atteint, indépendamment du rendez-vous.
     */
    soon: boolean;
}

export type ControlCounts = Record<ControlFilter, number>;

// ── Dates ────────────────────────────────────────────────────────

const PARIS_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Jour calendaire Europe/Paris (`YYYY-MM-DD`) d'un instant. */
export function parisDay(date: Date = new Date()): string {
    return PARIS_DAY.format(date);
}

/**
 * Jour d'une valeur de base : `YYYY-MM-DD` gardé tel quel ; un horodatage complet est
 * ramené à son jour Europe/Paris (ses 10 premiers caractères seraient le jour UTC). `null`
 * si illisible.
 */
function dayOf(value: string | null | undefined): string | null {
    if (!value) return null;
    if (value.length === 10) return isValidIsoDate(value) ? value : null;
    const t = new Date(value);
    return Number.isNaN(t.getTime()) ? null : parisDay(t);
}

/** Jours calendaires de `from` à `to` (`YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** `YYYY-MM-DD` + n jours. */
export function addDays(day: string, n: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` + n ans (un 29 février tombe au 1er mars). */
export function addYears(day: string, n: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() + n);
    return d.toISOString().slice(0, 10);
}

/** Date de rendez-vous hors de [aujourd'hui, aujourd'hui + 5 ans] : message d'erreur, sinon `null`. */
export function appointmentDateError(date: string, today: string): string | null {
    if (date < today) return 'La date du rendez-vous ne peut pas être passée.';
    if (date > addYears(today, MAX_APPOINTMENT_YEARS)) return `La date du rendez-vous ne peut pas dépasser ${MAX_APPOINTMENT_YEARS} ans.`;
    return null;
}

/** `2026-12-05` → `05/12/2026`. */
export function formatControlDay(day: string): string {
    const [y, m, d] = day.split('-');
    return `${d}/${m}/${y}`;
}

// ── Calcul ───────────────────────────────────────────────────────

const TYPE_ORDER: Record<ControlType, number> = { CT: 0, REVISION: 1, DESINFECTION: 2 };

/** Échéances brutes d'un véhicule : seules celles dont la donnée suffit. */
function vehicleDues(v: ControlVehicle, records: MaintenanceRecord[]): { type: ControlType; dueDate: string; remainingKm: number | null }[] {
    const out: { type: ControlType; dueDate: string; remainingKm: number | null }[] = [];

    const ct = getNextCtDate(v, records);
    if (ct && !Number.isNaN(ct.getTime())) out.push({ type: 'CT', dueDate: parisDay(ct), remainingKm: null });

    // `getNextRevision` renvoie « aujourd'hui » quand aucune date n'est calculable
    // (intervalle en années absent, ou ni révision ni première immatriculation) :
    // sans vraie date, pas d'échéance de révision.
    const hasRevisionBase = records.some(r => r.type === 'REVISION' || r.type === 'CT_REVISION') || !!v.firstRegistrationDate;
    const revision = getNextRevision(v, records);
    if (revision && v.revisionYearInterval !== null && hasRevisionBase && !Number.isNaN(revision.nextDate.getTime())) {
        out.push({
            type: 'REVISION',
            dueDate: parisDay(revision.nextDate),
            remainingKm: v.revisionKmInterval !== null ? revision.remainingKm : null,
        });
    }

    const desinf = v.desinfTracking ? dayOf(v.nextDesinfMaxDate) : null;
    if (desinf) out.push({ type: 'DESINFECTION', dueDate: desinf, remainingKm: null });

    return out;
}

/**
 * Lignes « Contrôles » d'une flotte, triées par échéance croissante.
 * État, dans cet ordre : « RDV fixé » si un rendez-vous a une date ≥ aujourd'hui ;
 * sinon « Dépassée » si l'échéance < aujourd'hui (ou, pour une révision, si le
 * kilométrage restant est ≤ 0) ; sinon « À dater ».
 * `today` : jour Europe/Paris `YYYY-MM-DD` (`parisDay()`).
 */
export function computeControls(
    vehicles: ControlVehicle[],
    records: MaintenanceRecord[],
    appointments: ControlAppointment[],
    today: string,
): ControlRow[] {
    const recordsByVehicle = new Map<string, MaintenanceRecord[]>();
    for (const r of records) {
        const list = recordsByVehicle.get(r.vehicleId) ?? [];
        list.push(r);
        recordsByVehicle.set(r.vehicleId, list);
    }
    const appointmentByKey = new Map(appointments.map(a => [`${a.vehicleId}:${a.controlType}`, a]));
    const soonLimit = addDays(today, CONTROL_SOON_DAYS);

    const rows: ControlRow[] = [];
    for (const v of vehicles) {
        for (const due of vehicleDues(v, recordsByVehicle.get(v.id) ?? [])) {
            const key = `${v.id}:${due.type}`;
            const appointment = appointmentByKey.get(key) ?? null;
            const appointmentPast = !!appointment && appointment.appointmentDate < today;
            const kmReached = due.remainingKm !== null && due.remainingKm <= 0;
            const state: ControlState = appointment && !appointmentPast
                ? 'SCHEDULED'
                : due.dueDate < today || kmReached ? 'OVERDUE' : 'TO_SCHEDULE';
            rows.push({
                key,
                vehicle: { id: v.id, name: v.name, plate: v.plate, type: v.type },
                controlType: due.type,
                dueDate: due.dueDate,
                daysUntilDue: daysBetween(today, due.dueDate),
                remainingKm: due.remainingKm,
                appointment,
                appointmentPast,
                state,
                soon: due.dueDate <= soonLimit || kmReached,
            });
        }
    }
    return rows.sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate)
        || a.vehicle.name.localeCompare(b.vehicle.name, 'fr', { numeric: true })
        || TYPE_ORDER[a.controlType] - TYPE_ORDER[b.controlType]);
}

/** La ligne correspond-elle au filtre ? */
export function matchesControlFilter(row: ControlRow, filter: ControlFilter): boolean {
    switch (filter) {
        case 'all': return true;
        // « À dater » : toute échéance sans rendez-vous à venir, dépassées comprises
        // (même critère que le compteur « Contrôles à dater » de la vue d'ensemble).
        case 'to_schedule': return row.state !== 'SCHEDULED';
        case 'soon': return row.soon;
        case 'overdue': return row.state === 'OVERDUE';
        case 'scheduled': return row.state === 'SCHEDULED';
    }
}

/** Effectifs de chaque filtre. */
export function countControls(rows: ControlRow[]): ControlCounts {
    const counts = Object.fromEntries(CONTROL_FILTERS.map(f => [f, 0])) as ControlCounts;
    for (const row of rows) for (const f of CONTROL_FILTERS) if (matchesControlFilter(row, f)) counts[f] += 1;
    return counts;
}

/** Libellé de l'échéance : « 12/12/2026 · dans 24 j », « dépassée de 2 j », « aujourd'hui ». */
export function dueLabel(row: Pick<ControlRow, 'dueDate' | 'daysUntilDue'>): string {
    const d = row.daysUntilDue;
    const rel = d === 0 ? "aujourd'hui" : d < 0 ? `dépassée de ${-d} j` : `dans ${d} j`;
    return `${formatControlDay(row.dueDate)} · ${rel}`;
}

// ── Validation ───────────────────────────────────────────────────

/** `PUT /api/fleet-tracking/controls/appointments` : création ou remplacement. */
export const appointmentSchema = z.object({
    vehicleId: z.string().trim().min(1, 'Véhicule requis').max(100),
    controlType: z.enum(CONTROL_TYPES, { error: 'Type de contrôle inconnu' }),
    /** Format seul ici ; la plage (aujourd'hui → + 5 ans) est vérifiée par la route (`appointmentDateError`). */
    appointmentDate: z.string().refine(isValidIsoDate, 'Date de rendez-vous invalide (AAAA-MM-JJ)'),
    contactId: z.union([z.literal(''), z.string().trim().min(1).max(100)]).nullable().optional()
        .transform(v => v || null),
    notes: z.string().trim().max(MAX_APPOINTMENT_NOTES, `Notes limitées à ${MAX_APPOINTMENT_NOTES} caractères`)
        .nullable().optional().transform(v => v || null),
    /**
     * Crée aussi une tâche « Rendez-vous <contrôle> — <véhicule> » (assignée à l'auteur
     * s'il est assignable dans l'UL) — ignoré si une tâche liée existe déjà.
     */
    createTask: z.boolean().optional().default(false),
}).strict();

export type AppointmentInput = z.infer<typeof appointmentSchema>;

/** `taskError` d'un PUT dont le rendez-vous est enregistré mais la tâche pas créée. */
export const APPOINTMENT_TASK_ERROR = "Rendez-vous enregistré, mais la tâche n'a pas pu être créée";

/** Titre de la tâche créée avec un rendez-vous. */
export function appointmentTaskTitle(controlType: ControlType, vehicleName: string): string {
    return `Rendez-vous ${CONTROL_TYPE_TASK_LABELS[controlType]} — ${vehicleName}`;
}
