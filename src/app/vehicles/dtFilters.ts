/**
 * Filtres de la Vue DT, côté client : état ↔ URL, raccourcis de période, filtrage à
 * facettes et textes affichés. Fonctions pures — l'état React vit dans `useDtFilters`.
 *
 * Le statut de chaque véhicule (`availability`) est calculé par le serveur
 * (`@/lib/dtAvailability`) ; ici on ne fait que filtrer et compter.
 */
import {
    DT_AVAILABILITY_STATUSES,
    compareVehicleTypes,
    normalizeVehicleType,
    type DtAvailabilityStatus,
} from '@/lib/dtAvailability';
import type { DashboardVehicle } from './types';

export type DtMode = 'now' | 'period';

export interface DtFilterState {
    mode: DtMode;
    /** ISO absolu, renseigné en mode Période uniquement. */
    from: string | null;
    to: string | null;
    dispo: DtAvailabilityStatus[];
    types: string[];
}

export const DEFAULT_DT_FILTERS: DtFilterState = { mode: 'now', from: null, to: null, dispo: [], types: [] };

/** Valeur dans l'URL de chaque statut (`dispo=disponible,reserve`). */
const DISPO_SLUGS: Record<DtAvailabilityStatus, string> = {
    AVAILABLE: 'disponible',
    POTENTIAL: 'potentiel',
    RESERVED: 'reserve',
    IN_USE: 'mission',
    MAINTENANCE: 'maintenance',
};

/** Libellés (puce au pluriel, badge au singulier), icône et classe `.status-badge`. */
export const DT_STATUS_META: Record<DtAvailabilityStatus, { chip: string; badge: string; icon: string; className: string }> = {
    AVAILABLE: { chip: 'Disponibles', badge: 'Disponible', icon: '🟢', className: 'available' },
    POTENTIAL: { chip: 'Potentiellement disponibles', badge: 'Potentiellement disponible', icon: '🕓', className: 'potential' },
    RESERVED: { chip: 'Réservés', badge: 'Réservé', icon: '📅', className: 'reserved' },
    IN_USE: { chip: 'En mission', badge: 'En mission', icon: '🟡', className: 'inuse' },
    MAINTENANCE: { chip: 'Maintenance', badge: 'Maintenance', icon: '🔴', className: 'maintenance' },
};

/** Statuts proposés en puces : « Potentiellement disponible » n'existe que sur une période future. */
export function dispoOptionsFor(mode: DtMode): DtAvailabilityStatus[] {
    return mode === 'period' ? DT_AVAILABILITY_STATUSES : DT_AVAILABILITY_STATUSES.filter((s) => s !== 'POTENTIAL');
}

const DT_PARAM_KEYS = ['vue', 'quand', 'debut', 'fin', 'dispo', 'type'];

const isValidDate = (value: string | null): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string));

const splitList = (value: string | null) => (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Lit l'état des filtres depuis l'URL. Les valeurs invalides sont ignorées sans message. */
export function parseDtFilterParams(params: URLSearchParams): { isDt: boolean; state: DtFilterState } {
    const isDt = params.get('vue') === 'dt';
    const from = params.get('debut');
    const to = params.get('fin');
    const isPeriod = params.get('quand') === 'periode' && isValidDate(from) && isValidDate(to);

    const slugToStatus = new Map(Object.entries(DISPO_SLUGS).map(([status, slug]) => [slug, status as DtAvailabilityStatus]));
    const dispo = [...new Set(splitList(params.get('dispo')).map((s) => slugToStatus.get(s)).filter((s): s is DtAvailabilityStatus => Boolean(s)))];
    const types = [...new Set(splitList(params.get('type')).map(normalizeVehicleType))];

    return {
        isDt,
        state: {
            mode: isPeriod ? 'period' : 'now',
            from: isPeriod ? new Date(from as string).toISOString() : null,
            to: isPeriod ? new Date(to as string).toISOString() : null,
            dispo,
            types,
        },
    };
}

/** Réécrit les paramètres DT en conservant les autres. Les valeurs par défaut sont omises. */
export function buildDtFilterParams(current: URLSearchParams, isDt: boolean, state: DtFilterState): URLSearchParams {
    const params = new URLSearchParams(current);
    DT_PARAM_KEYS.forEach((key) => params.delete(key));
    if (!isDt) return params;

    params.set('vue', 'dt');
    if (state.mode === 'period' && state.from && state.to) {
        params.set('quand', 'periode');
        params.set('debut', state.from);
        params.set('fin', state.to);
    }
    if (state.dispo.length > 0) params.set('dispo', state.dispo.map((s) => DISPO_SLUGS[s]).join(','));
    if (state.types.length > 0) params.set('type', state.types.join(','));
    return params;
}

// ── Période ──────────────────────────────────────────────────────────────────

const QUARTER_MS = 15 * 60 * 1000;

const floorToQuarter = (d: Date) => new Date(Math.floor(d.getTime() / QUARTER_MS) * QUARTER_MS);

function atTime(base: Date, dayOffset: number, hours: number, minutes = 0): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hours, minutes, 0, 0);
    return d;
}

/** Préremplissage au premier passage en mode Période : demain 08:00 → 20:00. */
export function defaultDtPeriod(now: Date): { from: Date; to: Date } {
    return { from: atTime(now, 1, 8), to: atTime(now, 1, 20) };
}

export type DtShortcut = 'today' | 'tomorrow' | 'weekend' | 'next7';

export const DT_SHORTCUTS: { key: DtShortcut; label: string }[] = [
    { key: 'today', label: 'Aujourd’hui' },
    { key: 'tomorrow', label: 'Demain' },
    { key: 'weekend', label: 'Ce week-end' },
    { key: 'next7', label: '7 prochains jours' },
];

/** Plage d'un raccourci, dans le fuseau du navigateur. */
export function dtShortcutRange(key: DtShortcut, now: Date): { from: Date; to: Date } {
    const start = floorToQuarter(now);
    switch (key) {
        case 'today':
            return { from: start, to: atTime(now, 0, 23, 59) };
        case 'tomorrow':
            return { from: atTime(now, 1, 0), to: atTime(now, 1, 23, 59) };
        case 'weekend': {
            const day = now.getDay(); // 0 = dimanche, 6 = samedi
            if (day === 0) return { from: start, to: atTime(now, 0, 23, 59) };
            if (day === 6) return { from: start, to: atTime(now, 1, 23, 59) };
            return { from: atTime(now, 6 - day, 0), to: atTime(now, 7 - day, 23, 59) };
        }
        case 'next7': {
            // Arithmétique calendaire : même heure locale à J+7, y compris au changement d'heure.
            const to = new Date(start);
            to.setDate(to.getDate() + 7);
            return { from: start, to };
        }
    }
}

/** `Date` → valeur d'un `<input type="datetime-local">` (heure locale, à la minute). */
export function toLocalInputValue(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valeur d'un `datetime-local` → `Date` (heure locale), `null` si incomplète. */
export function fromLocalInputValue(value: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

// ── Filtrage à facettes ──────────────────────────────────────────────────────

export function dtStatusOf(v: DashboardVehicle): DtAvailabilityStatus {
    return v.availability?.status ?? 'AVAILABLE';
}

export interface DtFacets {
    visible: DashboardVehicle[];
    /** Par statut : véhicules qui passent le filtre Type. */
    dispoCounts: Record<DtAvailabilityStatus, number>;
    /** Types présents dans la DT, triés, avec les véhicules qui passent le filtre Disponibilité. */
    typeOptions: { type: string; count: number }[];
    /** Types sélectionnés encore présents dans la DT (un type absent est retiré en silence). */
    activeTypes: string[];
    /** Compteurs de FleetStatsRow : suivent le filtre Type, pas le filtre Disponibilité. */
    stats: { total: number; available: number; inUse: number; maintenance: number };
}

/**
 * Plusieurs puces d'un même groupe s'additionnent (OU), deux groupes se combinent (ET).
 * Un groupe n'influe jamais sur ses propres compteurs.
 */
export function applyDtFilters(
    vehicles: DashboardVehicle[],
    filters: { dispo: DtAvailabilityStatus[]; types: string[] },
): DtFacets {
    const presentTypes = [...new Set(vehicles.map((v) => normalizeVehicleType(v.type)))].sort(compareVehicleTypes);
    const activeTypes = filters.types.filter((t) => presentTypes.includes(t));

    const matchType = (v: DashboardVehicle) => activeTypes.length === 0 || activeTypes.includes(normalizeVehicleType(v.type));
    const matchDispo = (v: DashboardVehicle) => filters.dispo.length === 0 || filters.dispo.includes(dtStatusOf(v));

    const byType = vehicles.filter(matchType);
    const byDispo = vehicles.filter(matchDispo);

    const dispoCounts = Object.fromEntries(
        DT_AVAILABILITY_STATUSES.map((s) => [s, byType.filter((v) => dtStatusOf(v) === s).length]),
    ) as Record<DtAvailabilityStatus, number>;

    return {
        visible: byType.filter(matchDispo),
        dispoCounts,
        typeOptions: presentTypes.map((type) => ({
            type,
            count: byDispo.filter((v) => normalizeVehicleType(v.type) === type).length,
        })),
        activeTypes,
        stats: {
            total: byType.length,
            available: dispoCounts.AVAILABLE,
            inUse: dispoCounts.IN_USE,
            maintenance: dispoCounts.MAINTENANCE,
        },
    };
}

// ── Textes ───────────────────────────────────────────────────────────────────

const shortDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const shortTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « sam. 10 oct. 08:00 » */
export function formatDtDateTime(iso: string | Date): string {
    const d = new Date(iso);
    return `${shortDate.format(d)} ${shortTime.format(d)}`;
}

/** « 14:32 » */
export function formatDtTime(iso: string | Date): string {
    return shortTime.format(new Date(iso));
}

/** « 06/10/2026 » */
export function formatDtDay(iso: string | Date): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Phrase de synthèse : « 4 véhicules · VPSP, VL · disponibles du sam. 10 oct. 08:00 au sam. 10 oct. 20:00 ». */
export function buildDtSummary(input: {
    count: number;
    types: string[];
    dispo: DtAvailabilityStatus[];
    mode: DtMode;
    from: string | null;
    to: string | null;
    now: Date;
}): string {
    const count = `${input.count} véhicule${input.count > 1 ? 's' : ''}`;
    const types = input.types.length > 0 ? input.types.join(', ') : 'tous types';
    const dispo = input.dispo.length > 0
        ? input.dispo.map((s) => DT_STATUS_META[s].chip.toLowerCase()).join(' ou ')
        : 'tous statuts';
    if (input.mode === 'now' || !input.from || !input.to) {
        return `${count} · ${types} · ${dispo} maintenant`;
    }
    let sentence = `${count} · ${types} · ${dispo} du ${formatDtDateTime(input.from)} au ${formatDtDateTime(input.to)}`;
    if (new Date(input.from).getTime() < input.now.getTime()) {
        sentence += ` · calculé à partir de maintenant (${formatDtTime(input.now)})`;
    }
    return sentence;
}
