/**
 * Tests d'intégration — suivi technique, vue d'ensemble :
 *   GET /api/fleet-tracking/overview
 *
 * `canManageVehicles`, cloisonné à l'UL de session ; agrégats en lecture seule des
 * tâches, dossiers et contrôles (compteurs, prochaines actions, encart prioritaire,
 * véhicules, badges des sous-onglets).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/push', () => ({ notifyUsers: vi.fn(async () => true) }));

import { GET } from '@/app/api/fleet-tracking/overview/route';
import { GET as listControls } from '@/app/api/fleet-tracking/controls/route';
import { GET as listTasksRoute } from '@/app/api/fleet-tracking/tasks/route';
import { matchesControlFilter, type ControlCounts, type ControlRow } from '@/lib/fleetTracking/controls';
import type { FleetTask } from '@/lib/fleetTracking/tasks';
import { auth } from '@/auth';
import type { FleetOverview } from '@/lib/fleetTracking/overview';
import { db, seedUniteLocale, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);
const session = (roles: string[], ulId: string, id: string) =>
    ({ user: { id, email: `${id}@test.com`, name: `Nom ${id}`, ulId, roles } }) as never;
const as = (s: unknown) => mockedAuth.mockResolvedValue(s as never);

const RESP_A = session(['RESP_VEHICULE'], 'ul-a', 'u-resp-a');
const ADMIN_B = session(['ADMIN'], 'ul-b', 'u-admin-b');
const CHVL_A = session(['CHVL'], 'ul-a', 'u-chvl-a');

let n = 0;
async function seedTask(ulId: string, over: { status?: string; priority?: string; dueDate?: string | null; pinned?: boolean; dossierId?: string | null; title?: string } = {}) {
    n += 1;
    const id = `t-${n}`;
    await db.execute({
        sql: `INSERT INTO "FleetTask" (id, ulId, dossierId, title, status, priority, dueDate, pinned, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, ulId, over.dossierId ?? null, over.title ?? `Tâche ${n}`, over.status ?? 'TODO', over.priority ?? 'NORMAL',
            over.dueDate ?? null, over.pinned ? 1 : 0, `2026-11-01T10:00:${String(n).padStart(2, '0')}Z`, 't'],
    });
    return id;
}

async function seedDossier(ulId: string, vehicleId: string, over: { status?: string; pinned?: boolean; title?: string } = {}) {
    n += 1;
    const id = `d-${n}`;
    await db.execute({
        sql: `INSERT INTO "FleetDossier" (id, ulId, vehicleId, title, status, pinned, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, 't', 't')`,
        args: [id, ulId, vehicleId, over.title ?? `Dossier ${n}`, over.status ?? 'OPEN', over.pinned ? 1 : 0],
    });
    return id;
}

async function seedItem(dossierId: string, received = false) {
    n += 1;
    await db.execute({
        sql: `INSERT INTO "FleetDossierItem" (id, dossierId, label, received, position, createdAt) VALUES (?, ?, ?, ?, 0, 't')`,
        args: [`i-${n}`, dossierId, `Pièce ${n}`, received ? 1 : 0],
    });
}

async function overview(): Promise<FleetOverview> {
    const res = await GET();
    expect(res.status).toBe(200);
    return res.json();
}

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
    mockedAuth.mockReset();
    await seedUniteLocale({ id: 'ul-a', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-b', name: 'Paris 15', slug: 'paris-15' });
    await seedVehicle({ id: 'veh-188', name: '75-188', plate: 'GV-114-QM', type: 'VL', ulId: 'ul-a' });
    await seedVehicle({ id: 'veh-182', name: '75-182', plate: 'FT-503-KD', type: 'VPSP', ulId: 'ul-a' });
    await seedVehicle({ id: 'veh-b', name: '75-150', plate: 'BB-150-BB', type: 'VPSP', ulId: 'ul-b', desinfTracking: true, nextDesinfMaxDate: '2026-11-16' });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('accès', () => {
    it('401 sans session', async () => {
        as(null);
        expect((await GET()).status).toBe(401);
    });

    it('403 pour un CHVL', async () => {
        as(CHVL_A);
        expect((await GET()).status).toBe(403);
    });
});

describe('GET /api/fleet-tracking/overview', () => {
    it('UL sans données : compteurs à 0, encart vide, aucune action, véhicules à 0 dossier', async () => {
        as(RESP_A);
        const o = await overview();
        expect(o.today).toBe('2026-11-18');
        expect(o.counters).toEqual({ openDossiers: 0, vehicleCount: 2, dueSoon: 0, dueSoonTasks: 0, dueSoonControls: 0, missingItems: 0, controlsToSchedule: 0 });
        expect(o.nextActions).toEqual([]);
        expect(o.nextActionsTotal).toBe(0);
        expect(o.priority).toEqual({ pinned: [], fallback: null });
        expect(o.vehicles.map(v => [v.name, v.model, v.plate, v.openDossiers]))
            .toEqual([['75-182', 'VPSP', 'FT-503-KD', 0], ['75-188', 'VL', 'GV-114-QM', 0]]);
        expect(o.tabCounts).toEqual({ tasks: 0, dossiers: 0 });
    });

    it('dossiers ouverts et pièces non reçues des seuls dossiers ouverts', async () => {
        const d1 = await seedDossier('ul-a', 'veh-188');
        const d2 = await seedDossier('ul-a', 'veh-188');
        const closed = await seedDossier('ul-a', 'veh-182', { status: 'CLOSED' });
        await seedItem(d1);
        await seedItem(d2);
        await seedItem(d2, true);
        await seedItem(closed);
        as(RESP_A);
        const o = await overview();
        expect(o.counters.openDossiers).toBe(2);
        expect(o.counters.missingItems).toBe(2);
        expect(o.tabCounts.dossiers).toBe(2);
        expect(o.vehicles.find(v => v.id === 'veh-188')?.openDossiers).toBe(2);
        expect(o.vehicles.find(v => v.id === 'veh-182')?.openDossiers).toBe(0);
    });

    it('échéances : tâche à 10 j + désinfection dépassée ; pas la tâche à 40 j ni la terminée', async () => {
        await seedTask('ul-a', { dueDate: '2026-11-28' });
        await seedTask('ul-a', { dueDate: '2026-12-28' });
        await seedTask('ul-a', { dueDate: '2026-11-17', status: 'DONE' });
        await db.execute({ sql: `UPDATE "Vehicle" SET desinfTracking = 1, nextDesinfMaxDate = '2026-11-16' WHERE id = 'veh-182'`, args: [] });
        as(RESP_A);
        const o = await overview();
        expect(o.counters.dueSoon).toBe(2);
        expect(o.counters.dueSoonTasks).toBe(1);
        expect(o.counters.dueSoonControls).toBe(1);
        // Désinfection dépassée sans rendez-vous : à dater.
        expect(o.counters.controlsToSchedule).toBe(1);
        expect(o.nextActionsTotal).toBe(2);
        expect(o.tabCounts.tasks).toBe(2);
    });

    it('contrôle avec rendez-vous futur : n\'est plus à dater', async () => {
        await db.execute({ sql: `UPDATE "Vehicle" SET desinfTracking = 1, nextDesinfMaxDate = '2026-11-16' WHERE id = 'veh-182'`, args: [] });
        await db.execute({
            sql: `INSERT INTO "FleetControlAppointment" (id, ulId, vehicleId, controlType, appointmentDate, createdAt, updatedAt)
                  VALUES ('a-1', 'ul-a', 'veh-182', 'DESINFECTION', '2026-11-25', 't', 't')`,
            args: [],
        });
        as(RESP_A);
        const o = await overview();
        expect(o.counters.controlsToSchedule).toBe(0);
        expect(o.counters.dueSoon).toBe(1);
    });

    it('« Contrôles à dater » égale le nombre de lignes du filtre « À dater » de l\'onglet Contrôles', async () => {
        // CT du 75-188 au 12/12 (à dater), désinfection du 75-182 dépassée (à dater), CT du 75-182 avec RDV futur.
        await db.execute({
            sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage) VALUES ('r-1', 'veh-188', '2024-12-12', 'CT', NULL)`,
            args: [],
        });
        await db.execute({
            sql: `UPDATE "Vehicle" SET desinfTracking = 1, nextDesinfMaxDate = '2026-11-16', firstRegistrationDate = '2026-06-01' WHERE id = 'veh-182'`,
            args: [],
        });
        await db.execute({
            sql: `INSERT INTO "FleetControlAppointment" (id, ulId, vehicleId, controlType, appointmentDate, createdAt, updatedAt)
                  VALUES ('a-1', 'ul-a', 'veh-182', 'CT', '2026-12-01', 't', 't')`,
            args: [],
        });
        as(RESP_A);
        const o = await overview();
        const res = await listControls();
        const { controls, counts } = await res.json() as { controls: ControlRow[]; counts: ControlCounts };
        const filtered = controls.filter(c => matchesControlFilter(c, 'to_schedule'));
        expect(o.counters.controlsToSchedule).toBe(2);
        expect(filtered).toHaveLength(o.counters.controlsToSchedule);
        expect(counts.to_schedule).toBe(o.counters.controlsToSchedule);
    });

    it('rendez-vous et sa tâche liée comptés une fois ; filtre Tâches `due=soon`', async () => {
        await db.execute({ sql: `UPDATE "Vehicle" SET desinfTracking = 1, nextDesinfMaxDate = '2026-11-30' WHERE id = 'veh-182'`, args: [] });
        const linked = await seedTask('ul-a', { dueDate: '2026-11-25', title: 'Rendez-vous désinfection' });
        await seedTask('ul-a', { dueDate: '2026-11-17', title: 'En retard' });
        await seedTask('ul-a', { dueDate: '2026-12-28', title: 'Lointaine' });
        await seedTask('ul-a', { dueDate: '2026-11-20', status: 'DONE', title: 'Terminée' });
        await seedTask('ul-b', { dueDate: '2026-11-20', title: 'Autre UL' });
        await db.execute({
            sql: `INSERT INTO "FleetControlAppointment" (id, ulId, vehicleId, controlType, appointmentDate, taskId, createdAt, updatedAt)
                  VALUES ('a-1', 'ul-a', 'veh-182', 'DESINFECTION', '2026-11-25', ?, 't', 't')`,
            args: [linked],
        });
        as(RESP_A);
        const o = await overview();
        expect(o.counters).toMatchObject({ dueSoon: 2, dueSoonTasks: 1, dueSoonControls: 1 });

        const res = await listTasksRoute(new Request('http://localhost/api/fleet-tracking/tasks?due=soon'));
        expect(res.status).toBe(200);
        const { tasks } = await res.json() as { tasks: FleetTask[] };
        expect(tasks.map(t => t.title).sort()).toEqual(['En retard', 'Rendez-vous désinfection']);
        expect((await listTasksRoute(new Request('http://localhost/api/fleet-tracking/tasks?due=bientot'))).status).toBe(400);
    });

    it('prochaines actions triées : HIGH à 3 j, HIGH sans date, NORMAL demain', async () => {
        await seedTask('ul-a', { priority: 'HIGH', title: 'HIGH sans date' });
        await seedTask('ul-a', { dueDate: '2026-11-19', title: 'NORMAL demain' });
        await seedTask('ul-a', { priority: 'HIGH', dueDate: '2026-11-21', title: 'HIGH 3 j' });
        as(RESP_A);
        const o = await overview();
        expect(o.nextActions.map(t => t.title)).toEqual(['HIGH 3 j', 'HIGH sans date', 'NORMAL demain']);
        // Aucun épinglé : repli sur la Prioritaire à l'échéance la plus proche.
        expect(o.priority.pinned).toEqual([]);
        expect(o.priority.fallback?.title).toBe('HIGH 3 j');
    });

    it('épinglés : tâche due 20/11 puis dossier sans tâche datée ; la terminée absente', async () => {
        await seedTask('ul-a', { pinned: true, dueDate: '2026-11-20', title: 'Confirmer le devis' });
        const d = await seedDossier('ul-a', 'veh-188', { pinned: true, title: 'Sinistre roue' });
        await seedTask('ul-a', { dossierId: d });
        await seedTask('ul-a', { pinned: true, status: 'DONE', title: 'Terminée' });
        await seedTask('ul-a', { priority: 'HIGH', dueDate: '2026-11-19' });
        as(RESP_A);
        const o = await overview();
        expect(o.priority.pinned.map(i => (i.kind === 'TASK' ? i.task.title : i.dossier.title))).toEqual(['Confirmer le devis', 'Sinistre roue']);
        expect(o.priority.fallback).toBeNull();
    });

    it('les données d\'une autre UL ne sont jamais comptées', async () => {
        const dB = await seedDossier('ul-b', 'veh-b', { pinned: true });
        await seedItem(dB);
        await seedTask('ul-b', { priority: 'HIGH', dueDate: '2026-11-20', pinned: true });
        as(RESP_A);
        const a = await overview();
        expect(a.counters).toEqual({ openDossiers: 0, vehicleCount: 2, dueSoon: 0, dueSoonTasks: 0, dueSoonControls: 0, missingItems: 0, controlsToSchedule: 0 });
        expect(a.nextActions).toEqual([]);
        expect(a.priority).toEqual({ pinned: [], fallback: null });
        expect(a.vehicles.map(v => v.id)).not.toContain('veh-b');

        as(ADMIN_B);
        const b = await overview();
        expect(b.counters.openDossiers).toBe(1);
        expect(b.counters.missingItems).toBe(1);
        // Désinfection dépassée du 75-150 + la tâche à 2 j.
        expect(b.counters.dueSoon).toBe(2);
        expect(b.priority.pinned).toHaveLength(2);
    });
});
