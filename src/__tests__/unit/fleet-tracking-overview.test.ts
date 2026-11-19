/**
 * Tests unitaires — vue d'ensemble du suivi technique (src/lib/fleetTracking/overview.ts) :
 * tri des prochaines actions, encart « À confirmer en priorité » et son repli, compteurs.
 */
import { describe, it, expect } from 'vitest';
import {
    buildOverview,
    compareNextActions,
    computeCounters,
    dossierNextDue,
    NEXT_ACTIONS_LIMIT,
    selectFallback,
    selectPinned,
    sortNextActions,
    type OverviewSource,
} from '@/lib/fleetTracking/overview';
import type { ControlRow } from '@/lib/fleetTracking/controls';
import type { FleetDossier } from '@/lib/fleetTracking/dossiers';
import type { FleetTask } from '@/lib/fleetTracking/tasks';

const TODAY = '2026-11-18';

let seq = 0;
function task(over: Partial<FleetTask> = {}): FleetTask {
    seq += 1;
    return {
        id: `t-${seq}`, title: `Tâche ${seq}`, description: null, status: 'TODO', priority: 'NORMAL',
        dueDate: null, pinned: false, dossierId: null, completedAt: null,
        createdAt: `2026-11-01T10:00:${String(seq).padStart(2, '0')}Z`, updatedAt: 't',
        assignees: [], links: [], attachmentCount: 0, ...over,
    };
}

function dossier(over: Partial<FleetDossier> = {}): FleetDossier {
    seq += 1;
    return {
        id: `d-${seq}`, title: `Dossier ${seq}`, description: null, status: 'OPEN', pinned: false,
        vehicles: [{ id: 'veh-188', name: '75-188', plate: null, missing: false }], createdByName: null,
        createdAt: 't', updatedAt: 't', closedAt: null,
        taskCount: 0, openTaskCount: 0, itemCount: 0, missingItemCount: 0, attachmentCount: 0, ...over,
    };
}

function control(over: Partial<ControlRow> = {}): ControlRow {
    return {
        key: 'veh-188:CT', vehicle: { id: 'veh-188', name: '75-188', plate: null, type: 'VL' }, controlType: 'CT',
        dueDate: '2026-12-12', daysUntilDue: 24, remainingKm: null, appointment: null, appointmentPast: false,
        state: 'TO_SCHEDULE', soon: true, ...over,
    };
}

function source(over: Partial<OverviewSource> = {}): OverviewSource {
    return { today: TODAY, tasks: [], dossiers: [], controls: [], vehicles: [], ...over };
}

describe('prochaines actions', () => {
    it('Prioritaire d\'abord, puis échéance croissante, « Date à fixer » en dernier', () => {
        const highNoDate = task({ priority: 'HIGH', title: 'HIGH sans date' });
        const normalTomorrow = task({ dueDate: '2026-11-19', title: 'NORMAL demain' });
        const high3 = task({ priority: 'HIGH', dueDate: '2026-11-21', title: 'HIGH 3 j' });
        expect(sortNextActions([highNoDate, normalTomorrow, high3]).map(t => t.title))
            .toEqual(['HIGH 3 j', 'HIGH sans date', 'NORMAL demain']);
    });

    it('écarte les tâches terminées ; à égalité, la plus ancienne d\'abord', () => {
        const older = task({ dueDate: '2026-11-20' });
        const newer = task({ dueDate: '2026-11-20' });
        const done = task({ status: 'DONE', dueDate: '2026-11-19' });
        expect(sortNextActions([newer, done, older]).map(t => t.id)).toEqual([older.id, newer.id]);
        expect(compareNextActions(older, newer)).toBeLessThan(0);
    });

    it('n\'en garde que 5, total à part', () => {
        const tasks = Array.from({ length: 7 }, () => task());
        const o = buildOverview(source({ tasks }));
        expect(o.nextActions).toHaveLength(NEXT_ACTIONS_LIMIT);
        expect(o.nextActionsTotal).toBe(7);
        expect(o.tabCounts.tasks).toBe(7);
    });
});

describe('à confirmer en priorité', () => {
    it('tâche épinglée due 20/11, puis dossier épinglé sans tâche datée ; la terminée absente', () => {
        const pinnedTask = task({ pinned: true, dueDate: '2026-11-20', title: 'Confirmer le devis' });
        const pinnedDossier = dossier({ pinned: true, title: 'Sinistre' });
        const undatedInDossier = task({ dossierId: pinnedDossier.id });
        const pinnedDone = task({ pinned: true, status: 'DONE', dueDate: '2026-11-19' });
        const items = selectPinned([pinnedTask, undatedInDossier, pinnedDone], [pinnedDossier]);
        expect(items.map(i => i.kind)).toEqual(['TASK', 'DOSSIER']);
        expect(items[0].kind === 'TASK' && items[0].task.id).toBe(pinnedTask.id);
        expect(items[1].dueDate).toBeNull();
    });

    it('un dossier prend l\'échéance la plus proche de ses tâches ouvertes', () => {
        const d = dossier({ pinned: true });
        const tasks = [
            task({ dossierId: d.id, dueDate: '2026-11-30' }),
            task({ dossierId: d.id, dueDate: '2026-11-22' }),
            task({ dossierId: d.id, dueDate: '2026-11-19', status: 'DONE' }),
            task({ dueDate: '2026-11-19' }),
        ];
        expect(dossierNextDue(d.id, tasks)).toBe('2026-11-22');
        const laterTask = task({ pinned: true, dueDate: '2026-11-25' });
        expect(selectPinned([...tasks, laterTask], [d]).map(i => i.kind)).toEqual(['DOSSIER', 'TASK']);
    });

    it('dossier épinglé clos absent', () => {
        expect(selectPinned([], [dossier({ pinned: true, status: 'CLOSED' })])).toEqual([]);
    });

    it('repli sans épinglé : la tâche Prioritaire à l\'échéance la plus proche', () => {
        const later = task({ priority: 'HIGH', dueDate: '2026-11-28' });
        const sooner = task({ priority: 'HIGH', dueDate: '2026-11-21' });
        const normal = task({ dueDate: '2026-11-19' });
        expect(selectFallback([later, normal, sooner])?.id).toBe(sooner.id);
        const o = buildOverview(source({ tasks: [later, normal, sooner] }));
        expect(o.priority.pinned).toEqual([]);
        expect(o.priority.fallback?.id).toBe(sooner.id);
    });

    it('pas de repli quand un élément est épinglé ; rien sans Prioritaire', () => {
        const high = task({ priority: 'HIGH', dueDate: '2026-11-21' });
        const pinned = task({ pinned: true });
        expect(buildOverview(source({ tasks: [high, pinned] })).priority.fallback).toBeNull();
        expect(selectFallback([task(), task({ priority: 'HIGH', status: 'DONE' })])).toBeNull();
    });
});

describe('compteurs', () => {
    it('dossiers ouverts et pièces à récupérer des seuls dossiers ouverts', () => {
        const c = computeCounters(source({
            dossiers: [
                dossier({ missingItemCount: 1 }),
                dossier({ missingItemCount: 1 }),
                dossier({ status: 'CLOSED', missingItemCount: 1 }),
            ],
            vehicles: [{ id: 'veh-188', name: '75-188', model: 'VL', plate: null }],
        }));
        expect(c.openDossiers).toBe(2);
        expect(c.missingItems).toBe(2);
        expect(c.vehicleCount).toBe(1);
    });

    it('échéances : tâche à 10 j + contrôle dépassé ; pas la tâche à 40 j ni la terminée', () => {
        const c = computeCounters(source({
            tasks: [
                task({ dueDate: '2026-11-28' }),
                task({ dueDate: '2026-12-28' }),
                task({ dueDate: '2026-11-17', status: 'DONE' }),
                task({ dueDate: '2026-12-18' }), // pile 30 j : compté
                task({ dueDate: null }),
            ],
            controls: [
                control({ state: 'OVERDUE', soon: true, dueDate: '2026-11-16', daysUntilDue: -2 }),
                control({ state: 'TO_SCHEDULE', soon: false, dueDate: '2027-03-01', daysUntilDue: 103 }),
            ],
        }));
        expect(c.dueSoon).toBe(3);
        expect(c.dueSoonTasks).toBe(2);
        expect(c.dueSoonControls).toBe(1);
    });

    it('échéances : la tâche liée au rendez-vous d\'un contrôle compté n\'est comptée qu\'une fois', () => {
        const linked = task({ id: 't-linked', dueDate: '2026-11-25' });
        const other = task({ dueDate: '2026-11-26' });
        const appointment = {
            id: 'a-1', vehicleId: 'veh-188', controlType: 'CT' as const, appointmentDate: '2026-11-25',
            contactId: null, contactName: null, notes: null, taskId: 't-linked',
        };
        const c = computeCounters(source({
            tasks: [linked, other],
            controls: [control({ state: 'SCHEDULED', soon: true, appointment })],
        }));
        expect(c).toMatchObject({ dueSoon: 2, dueSoonTasks: 1, dueSoonControls: 1 });
        // Contrôle hors des 30 jours : sa tâche liée compte côté tâches.
        const far = computeCounters(source({
            tasks: [linked],
            controls: [control({ state: 'SCHEDULED', soon: false, appointment })],
        }));
        expect(far).toMatchObject({ dueSoon: 1, dueSoonTasks: 1, dueSoonControls: 0 });
    });

    it('contrôles à dater : « À dater » ou « Dépassée », pas « RDV fixé »', () => {
        const c = computeCounters(source({
            controls: [control({ state: 'TO_SCHEDULE' }), control({ state: 'OVERDUE' }), control({ state: 'SCHEDULED' })],
        }));
        expect(c.controlsToSchedule).toBe(2);
    });

    it('UL vide : tout à 0, encart vide, aucune action', () => {
        const o = buildOverview(source());
        expect(o.counters).toEqual({
            openDossiers: 0, vehicleCount: 0, dueSoon: 0, dueSoonTasks: 0, dueSoonControls: 0, missingItems: 0, controlsToSchedule: 0,
        });
        expect(o.priority).toEqual({ pinned: [], fallback: null });
        expect(o.nextActions).toEqual([]);
        expect(o.tabCounts).toEqual({ tasks: 0, dossiers: 0 });
    });
});

describe('véhicules', () => {
    it('nombre de dossiers ouverts par véhicule, véhicules sans dossier à 0, triés par indicatif', () => {
        const o = buildOverview(source({
            vehicles: [
                { id: 'veh-188', name: '75-188', model: 'VL', plate: 'GV-114-QM' },
                { id: 'veh-182', name: '75-182', model: 'VPSP', plate: null },
            ],
            dossiers: [dossier(), dossier(), dossier({ status: 'CLOSED' })],
        }));
        expect(o.vehicles.map(v => [v.name, v.openDossiers])).toEqual([['75-182', 0], ['75-188', 2]]);
    });
    it('un dossier sur plusieurs véhicules compte pour chacun ; un véhicule parti ne compte pas', () => {
        const o = buildOverview(source({
            vehicles: [
                { id: 'veh-188', name: '75-188', model: 'VL', plate: null },
                { id: 'veh-182', name: '75-182', model: 'VPSP', plate: null },
            ],
            dossiers: [dossier({
                vehicles: [
                    { id: 'veh-188', name: '75-188', plate: null, missing: false },
                    { id: 'veh-182', name: '75-182', plate: null, missing: false },
                    { id: 'veh-old', name: 'Véhicule indisponible', plate: null, missing: true },
                ],
            })],
        }));
        expect(o.vehicles.map(v => [v.name, v.openDossiers])).toEqual([['75-182', 1], ['75-188', 1]]);
    });
});
