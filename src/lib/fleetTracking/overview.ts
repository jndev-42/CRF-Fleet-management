import { addDays, CONTROL_SOON_DAYS, type ControlRow } from './controls';
import { isDossierActive, type FleetDossier } from './dossiers';
import type { FleetTask } from './tasks';

/**
 * Vue d'ensemble « Le point sur la flotte » (livrable 5, CAP-11) : agrégats des
 * tâches, dossiers et contrôles d'une UL. Aucune donnée propre : uniquement des
 * calculs sur l'existant.
 *
 * Module pur (aucun accès base, aucune session) : importé à la fois par la route et
 * par les composants client. Le chargement depuis la base est dans `overviewStore.ts`.
 */

/** Prochaines actions affichées (le total est renvoyé à part). */
export const NEXT_ACTIONS_LIMIT = 5;
/** Seuil « Échéances à traiter » des tâches, aligné sur celui des contrôles. */
export const OVERVIEW_SOON_DAYS = CONTROL_SOON_DAYS;

export interface OverviewCounters {
    /** Dossiers à l'état Ouvert. */
    openDossiers: number;
    /** Véhicules de l'UL (« Sur les N véhicules »). */
    vehicleCount: number;
    /** `dueSoonTasks` + `dueSoonControls`. */
    dueSoon: number;
    /**
     * Tâches non terminées à échéance ≤ aujourd'hui + 30 j (dépassées comprises), hors
     * tâche liée au rendez-vous d'un contrôle déjà compté dans `dueSoonControls`.
     */
    dueSoonTasks: number;
    /** Contrôles « sous 30 jours ». */
    dueSoonControls: number;
    /** Pièces non reçues des dossiers ouverts. */
    missingItems: number;
    /** Contrôles « À dater » ou « Dépassée » sans rendez-vous futur. */
    controlsToSchedule: number;
}

export interface OverviewVehicle {
    id: string;
    /** Indicatif (nom du véhicule). */
    name: string;
    /** Modèle : type du véhicule (VL, VPSP…), seule donnée de modèle en base. */
    model: string | null;
    plate: string | null;
    openDossiers: number;
}

/** Élément de l'encart « À confirmer en priorité ». */
export type PriorityItem =
    | { kind: 'TASK'; dueDate: string | null; task: FleetTask }
    /** `dueDate` : échéance la plus proche parmi les tâches ouvertes du dossier. */
    | { kind: 'DOSSIER'; dueDate: string | null; dossier: FleetDossier };

export interface FleetOverview {
    today: string;
    counters: OverviewCounters;
    nextActions: FleetTask[];
    nextActionsTotal: number;
    priority: {
        /** Tâches épinglées non terminées et dossiers épinglés ouverts. */
        pinned: PriorityItem[];
        /** Sans aucun épinglé : la tâche Prioritaire non terminée à l'échéance la plus proche. */
        fallback: FleetTask | null;
    };
    vehicles: OverviewVehicle[];
    /** Badges des sous-onglets : tâches non terminées, dossiers ouverts. */
    tabCounts: { tasks: number; dossiers: number };
}

export interface OverviewSource {
    today: string;
    /** Tâches de l'UL (toutes ; les terminées sont écartées ici). */
    tasks: FleetTask[];
    /** Dossiers de l'UL (tous ; les clos sont écartés ici). */
    dossiers: FleetDossier[];
    controls: ControlRow[];
    vehicles: Omit<OverviewVehicle, 'openDossiers'>[];
}

/** Échéances `null` en dernier, puis ordre croissant. */
function compareDue(a: string | null, b: string | null): number {
    if (a === b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
}

/**
 * Ordre des prochaines actions : Prioritaire d'abord, puis échéance croissante,
 * « Date à fixer » en dernier ; à égalité, la plus ancienne d'abord.
 */
export function compareNextActions(a: FleetTask, b: FleetTask): number {
    if (a.priority !== b.priority) return a.priority === 'HIGH' ? -1 : 1;
    return compareDue(a.dueDate, b.dueDate)
        || a.createdAt.localeCompare(b.createdAt)
        || a.id.localeCompare(b.id);
}

/** Tâches non terminées, dans l'ordre des prochaines actions. */
export function sortNextActions(tasks: FleetTask[]): FleetTask[] {
    return tasks.filter(t => t.status !== 'DONE').sort(compareNextActions);
}

/** Échéance la plus proche parmi les tâches non terminées d'un dossier, ou `null`. */
export function dossierNextDue(dossierId: string, tasks: FleetTask[]): string | null {
    let best: string | null = null;
    for (const t of tasks) {
        if (t.dossierId !== dossierId || t.status === 'DONE' || !t.dueDate) continue;
        if (best === null || t.dueDate < best) best = t.dueDate;
    }
    return best;
}

function itemTitle(item: PriorityItem): string {
    return item.kind === 'TASK' ? item.task.title : item.dossier.title;
}

/**
 * Encart « À confirmer en priorité » : tâches épinglées non terminées et dossiers
 * épinglés ouverts, échéance la plus proche d'abord, sans échéance en dernier.
 */
export function selectPinned(tasks: FleetTask[], dossiers: FleetDossier[]): PriorityItem[] {
    const items: PriorityItem[] = [
        ...tasks.filter(t => t.pinned && t.status !== 'DONE')
            .map(task => ({ kind: 'TASK' as const, dueDate: task.dueDate, task })),
        ...dossiers.filter(d => d.pinned && isDossierActive(d.status))
            .map(dossier => ({ kind: 'DOSSIER' as const, dueDate: dossierNextDue(dossier.id, tasks), dossier })),
    ];
    return items.sort((a, b) => compareDue(a.dueDate, b.dueDate) || itemTitle(a).localeCompare(itemTitle(b), 'fr'));
}

/** Repli sans épinglé : la tâche Prioritaire non terminée à l'échéance la plus proche, ou `null`. */
export function selectFallback(tasks: FleetTask[]): FleetTask | null {
    return sortNextActions(tasks.filter(t => t.priority === 'HIGH'))[0] ?? null;
}

/** Les quatre compteurs. */
export function computeCounters(src: OverviewSource): OverviewCounters {
    const limit = addDays(src.today, OVERVIEW_SOON_DAYS);
    const openDossiers = src.dossiers.filter(d => isDossierActive(d.status));
    const soonControls = src.controls.filter(c => c.soon);
    // Un rendez-vous et sa tâche liée ne comptent qu'une fois (côté contrôle).
    const linkedTaskIds = new Set(soonControls.flatMap(c => (c.appointment?.taskId ? [c.appointment.taskId] : [])));
    const dueTasks = src.tasks.filter(t => t.status !== 'DONE' && t.dueDate !== null && t.dueDate <= limit && !linkedTaskIds.has(t.id)).length;
    return {
        openDossiers: openDossiers.length,
        vehicleCount: src.vehicles.length,
        dueSoon: dueTasks + soonControls.length,
        dueSoonTasks: dueTasks,
        dueSoonControls: soonControls.length,
        missingItems: openDossiers.reduce((sum, d) => sum + d.missingItemCount, 0),
        controlsToSchedule: src.controls.filter(c => c.state !== 'SCHEDULED').length,
    };
}

/** Vue d'ensemble complète d'une UL. */
export function buildOverview(src: OverviewSource): FleetOverview {
    const open = sortNextActions(src.tasks);
    const pinned = selectPinned(src.tasks, src.dossiers);
    const openDossiersByVehicle = new Map<string, number>();
    for (const d of src.dossiers) {
        if (!isDossierActive(d.status)) continue;
        // Un dossier sur plusieurs véhicules compte pour chacun d'eux.
        for (const v of d.vehicles) {
            if (!v.missing) openDossiersByVehicle.set(v.id, (openDossiersByVehicle.get(v.id) ?? 0) + 1);
        }
    }
    const counters = computeCounters(src);
    return {
        today: src.today,
        counters,
        nextActions: open.slice(0, NEXT_ACTIONS_LIMIT),
        nextActionsTotal: open.length,
        priority: { pinned, fallback: pinned.length === 0 ? selectFallback(src.tasks) : null },
        vehicles: [...src.vehicles]
            .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))
            .map(v => ({ ...v, openDossiers: openDossiersByVehicle.get(v.id) ?? 0 })),
        tabCounts: { tasks: open.length, dossiers: counters.openDossiers },
    };
}
