/**
 * Tests d'intégration — suivi technique, contrôles à échéance :
 *   GET /api/fleet-tracking/controls
 *   PUT /api/fleet-tracking/controls/appointments
 *   DELETE /api/fleet-tracking/controls/appointments/[id]
 *
 * `canManageVehicles`, cloisonné à l'UL de session ; échéances lues depuis le véhicule,
 * un rendez-vous par véhicule et par type ; option « Créer une tâche ».
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/push', () => ({ notifyUsers: vi.fn(async () => true) }));

import { GET as listControls } from '@/app/api/fleet-tracking/controls/route';
import { PUT as putAppointment } from '@/app/api/fleet-tracking/controls/appointments/route';
import { DELETE as deleteAppointment } from '@/app/api/fleet-tracking/controls/appointments/[id]/route';
import { auth } from '@/auth';
import { notifyUsers } from '@/lib/push';
import type { ControlCounts, ControlRow } from '@/lib/fleetTracking/controls';
import { db, seedRoles, seedUniteLocale, seedUser, seedUserUL, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);
const mockedNotify = vi.mocked(notifyUsers);

const session = (roles: string[], ulId: string, id: string) =>
    ({ user: { id, email: `${id}@test.com`, name: `Nom ${id}`, ulId, roles } }) as never;

const RESP_A = session(['RESP_VEHICULE'], 'ul-a', 'u-resp-a');
const ADMIN_A = session(['ADMIN'], 'ul-a', 'u-admin-a');
const ADMIN_B = session(['ADMIN'], 'ul-b', 'u-admin-b');
const CHVL_A = session(['CHVL'], 'ul-a', 'u-chvl-a');
// SUPER_ADMIN dont l'UL active est ul-a sans y être rattaché : non assignable dans ul-a.
const SUPER_OUTSIDE = session(['SUPER_ADMIN'], 'ul-a', 'u-super');

const BASE = 'http://localhost/api/fleet-tracking/controls';

function req(method: string, body?: unknown, url = `${BASE}/appointments`): Request {
    return new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}
const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const as = (s: unknown) => mockedAuth.mockResolvedValue(s as never);

async function list(): Promise<{ controls: ControlRow[]; counts: ControlCounts; today: string }> {
    const res = await listControls();
    expect(res.status).toBe(200);
    return res.json();
}

async function put(body: Record<string, unknown>) {
    return putAppointment(req('PUT', { vehicleId: 'veh-184', controlType: 'CT', appointmentDate: '2026-11-28', ...body }));
}

async function seedContact(id: string, ulId: string, shared = 0, name = `Garage ${id}`) {
    await db.execute({
        sql: `INSERT INTO "FleetContact" (id, ulId, name, category, phones, shared, createdAt, updatedAt)
              VALUES (?, ?, ?, 'GARAGE', '[]', ?, 't', 't')`,
        args: [id, ulId, name, shared],
    });
}

beforeEach(async () => {
    // Aujourd'hui = 18/11/2026 à Paris (midi UTC).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
    mockedAuth.mockReset();
    mockedNotify.mockClear();
    await seedUniteLocale({ id: 'ul-a', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-b', name: 'Paris 15', slug: 'paris-15' });
    await seedRoles();
    await seedUser({ id: 'u-resp-a', email: 'resp-a@test.com', name: 'Camille Roux' });
    await seedUserUL({ userId: 'u-resp-a', ulId: 'ul-a', isHome: true, roles: ['RESP_VEHICULE'] });
    // 75-184 : CT le 12/12/2026 (dernier CT le 12/12/2024, VL → +2 ans).
    await seedVehicle({ id: 'veh-184', name: '75-184', plate: 'AA-184-AA', type: 'VL', ulId: 'ul-a' });
    await db.execute({
        sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage) VALUES ('rec-184', 'veh-184', '2024-12-12', 'CT', NULL)`,
        args: [],
    });
    // 75-182 : VPSP, désinfection dépassée (16/11/2026), CT depuis la mise en circulation.
    await seedVehicle({
        id: 'veh-182', name: '75-182', plate: 'AA-182-AA', type: 'VPSP', ulId: 'ul-a',
        desinfTracking: true, nextDesinfMaxDate: '2026-11-16', firstRegistrationDate: '2026-06-01',
    });
    // 75-186 : désinfection renseignée mais non suivie, aucune autre donnée.
    await seedVehicle({ id: 'veh-186', name: '75-186', plate: 'AA-186-AA', type: 'VL', ulId: 'ul-a', desinfTracking: false, nextDesinfMaxDate: '2026-11-20' });
    // Autre UL.
    await seedVehicle({ id: 'veh-b', name: '75-150', plate: 'BB-150-BB', type: 'VPSP', ulId: 'ul-b', desinfTracking: true, nextDesinfMaxDate: '2026-11-20' });
    await seedContact('c-a', 'ul-a', 0, 'Garage Renault Clichy');
    await seedContact('c-b-shared', 'ul-b', 1, 'Pneus Partagés');
    await seedContact('c-b-private', 'ul-b', 0);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('accès', () => {
    it('401 sans session', async () => {
        as(null);
        expect((await listControls()).status).toBe(401);
        expect((await put({})).status).toBe(401);
        expect((await deleteAppointment(req('DELETE'), withId('x'))).status).toBe(401);
    });

    it('403 pour un CHVL', async () => {
        as(CHVL_A);
        expect((await listControls()).status).toBe(403);
        expect((await put({})).status).toBe(403);
        expect((await deleteAppointment(req('DELETE'), withId('x'))).status).toBe(403);
    });
});

describe('GET /controls', () => {
    it('échéances de l\'UL seulement, triées, avec état et effectifs', async () => {
        as(RESP_A);
        const { controls, counts, today } = await list();
        expect(today).toBe('2026-11-18');
        expect(controls.map(c => `${c.vehicle.name}:${c.controlType}:${c.dueDate}:${c.state}`)).toEqual([
            '75-182:DESINFECTION:2026-11-16:OVERDUE',
            '75-184:CT:2026-12-12:TO_SCHEDULE',
            '75-182:CT:2027-06-01:TO_SCHEDULE',
        ]);
        expect(controls.some(c => c.vehicle.id === 'veh-186' || c.vehicle.id === 'veh-b')).toBe(false);
        expect(counts).toEqual({ all: 3, to_schedule: 2, soon: 2, overdue: 1, scheduled: 0 });
    });

    it('ne lit ni n\'écrit rien dans Vehicle', async () => {
        as(RESP_A);
        const before = (await db.execute(`SELECT * FROM "Vehicle" ORDER BY id`)).rows;
        await list();
        await put({});
        expect((await db.execute(`SELECT * FROM "Vehicle" ORDER BY id`)).rows).toEqual(before);
    });
});

describe('PUT /controls/appointments', () => {
    it('création : 200, la ligne passe « RDV fixé » et sort du filtre « À dater »', async () => {
        as(RESP_A);
        const res = await put({ contactId: 'c-a', notes: 'Apporter la carte grise' });
        expect(res.status).toBe(200);
        const body = await res.json() as { id: string; appointment: { contactName: string }; taskId: string | null };
        expect(body.appointment.contactName).toBe('Garage Renault Clichy');
        expect(body.taskId).toBeNull();

        const { controls, counts } = await list();
        const ct = controls.find(c => c.key === 'veh-184:CT');
        expect(ct).toMatchObject({ state: 'SCHEDULED', soon: true });
        expect(ct?.appointment).toMatchObject({ appointmentDate: '2026-11-28', contactName: 'Garage Renault Clichy', notes: 'Apporter la carte grise' });
        expect(counts.to_schedule).toBe(1);
        expect(counts.scheduled).toBe(1);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetTask"`)).rows[0].n).toBe(0);
    });

    it('remplace le rendez-vous existant du même type (même identifiant)', async () => {
        as(RESP_A);
        const first = await (await put({ contactId: 'c-a' })).json() as { id: string };
        as(ADMIN_A);
        const second = await (await put({ appointmentDate: '2026-12-02', contactId: null })).json() as { id: string };
        expect(second.id).toBe(first.id);
        const rows = (await db.execute(`SELECT * FROM "FleetControlAppointment"`)).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ appointmentDate: '2026-12-02', contactId: null, createdBy: 'u-resp-a' });
    });

    it('un type différent crée un second rendez-vous', async () => {
        as(RESP_A);
        await put({ vehicleId: 'veh-182', controlType: 'CT' });
        await put({ vehicleId: 'veh-182', controlType: 'DESINFECTION' });
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetControlAppointment"`)).rows[0].n).toBe(2);
    });

    it('rendez-vous passé : « À dater » avec le rendez-vous conservé', async () => {
        as(RESP_A);
        expect((await put({ appointmentDate: '2026-11-20' })).status).toBe(200);
        vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
        const ct = (await list()).controls.find(c => c.key === 'veh-184:CT');
        expect(ct).toMatchObject({ state: 'TO_SCHEDULE', appointmentPast: true });
    });

    it('contact partagé par une autre UL : accepté', async () => {
        as(RESP_A);
        const res = await put({ contactId: 'c-b-shared' });
        expect(res.status).toBe(200);
        expect((await res.json() as { appointment: { contactName: string } }).appointment.contactName).toBe('Pneus Partagés');
    });

    it('+ tâche : créée, rattachée au véhicule et au garage, assignée à l\'auteur, sans notification', async () => {
        as(RESP_A);
        const res = await put({ contactId: 'c-a', createTask: true });
        expect(res.status).toBe(200);
        const { taskId, taskCreated, taskError } = await res.json() as { taskId: string; taskCreated: boolean; taskError: string | null };
        expect(taskId).toBeTruthy();
        expect(taskCreated).toBe(true);
        expect(taskError).toBeNull();
        expect((await db.execute(`SELECT taskId FROM "FleetControlAppointment"`)).rows[0].taskId).toBe(taskId);
        const task = (await db.execute({ sql: `SELECT * FROM "FleetTask" WHERE id = ?`, args: [taskId] })).rows[0];
        expect(task).toMatchObject({ ulId: 'ul-a', title: 'Rendez-vous contrôle technique — 75-184', dueDate: '2026-11-28', status: 'TODO', createdBy: 'u-resp-a' });
        const links = (await db.execute({ sql: `SELECT targetType, targetId FROM "FleetTaskLink" WHERE taskId = ? ORDER BY targetType`, args: [taskId] })).rows;
        expect(links.map(l => `${l.targetType}:${l.targetId}`)).toEqual(['CONTACT:c-a', 'VEHICLE:veh-184']);
        const assignees = (await db.execute({ sql: `SELECT userId FROM "FleetTaskAssignee" WHERE taskId = ?`, args: [taskId] })).rows;
        expect(assignees.map(a => a.userId)).toEqual(['u-resp-a']);
        expect(mockedNotify).not.toHaveBeenCalled();
    });

    it('+ tâche sans garage : rattachée au seul véhicule', async () => {
        as(RESP_A);
        const { taskId } = await (await put({ vehicleId: 'veh-182', controlType: 'DESINFECTION', createTask: true })).json() as { taskId: string };
        const links = (await db.execute({ sql: `SELECT targetType FROM "FleetTaskLink" WHERE taskId = ?`, args: [taskId] })).rows;
        expect(links.map(l => l.targetType)).toEqual(['VEHICLE']);
        const task = (await db.execute({ sql: `SELECT title FROM "FleetTask" WHERE id = ?`, args: [taskId] })).rows[0];
        expect(task.title).toBe('Rendez-vous désinfection — 75-182');
    });

    it('+ tâche : jamais de doublon, l\'échéance de la tâche liée suit la date du rendez-vous', async () => {
        as(RESP_A);
        const first = await (await put({ createTask: true })).json() as { taskId: string };
        const second = await (await put({ appointmentDate: '2026-12-03', createTask: true })).json() as { taskId: string; taskCreated: boolean };
        expect(second.taskId).toBe(first.taskId);
        expect(second.taskCreated).toBe(false);
        const tasks = (await db.execute(`SELECT id, dueDate FROM "FleetTask"`)).rows;
        expect(tasks).toHaveLength(1);
        expect(tasks[0].dueDate).toBe('2026-12-03');
        const ct = (await list()).controls.find(c => c.key === 'veh-184:CT');
        expect(ct?.appointment?.taskId).toBe(first.taskId);
    });

    it('+ tâche : la tâche liée supprimée, une nouvelle peut être créée', async () => {
        as(RESP_A);
        const first = await (await put({ createTask: true })).json() as { taskId: string };
        await db.execute({ sql: `DELETE FROM "FleetTask" WHERE id = ?`, args: [first.taskId] });
        expect((await list()).controls.find(c => c.key === 'veh-184:CT')?.appointment?.taskId).toBeNull();
        const second = await (await put({ createTask: true })).json() as { taskId: string; taskCreated: boolean };
        expect(second.taskCreated).toBe(true);
        expect(second.taskId).not.toBe(first.taskId);
    });

    it('+ tâche : auteur non assignable dans l\'UL → tâche sans assigné', async () => {
        as(SUPER_OUTSIDE);
        const { taskId } = await (await put({ createTask: true })).json() as { taskId: string };
        expect(taskId).toBeTruthy();
        expect((await db.execute({ sql: `SELECT COUNT(*) AS n FROM "FleetTask" WHERE id = ?`, args: [taskId] })).rows[0].n).toBe(1);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetTaskAssignee"`)).rows[0].n).toBe(0);
    });

    it('+ tâche en échec : 200, rendez-vous enregistré, taskError renvoyé', async () => {
        as(RESP_A);
        await db.execute(`CREATE TRIGGER fail_task BEFORE INSERT ON "FleetTask" BEGIN SELECT RAISE(ABORT, 'boom'); END`);
        try {
            const res = await put({ createTask: true });
            expect(res.status).toBe(200);
            const body = await res.json() as { taskId: string | null; taskError: string; appointment: unknown };
            expect(body.taskId).toBeNull();
            expect(body.taskError).toBe("Rendez-vous enregistré, mais la tâche n'a pas pu être créée");
            expect(body.appointment).toBeTruthy();
            const rows = (await db.execute(`SELECT taskId FROM "FleetControlAppointment"`)).rows;
            expect(rows).toHaveLength(1);
            expect(rows[0].taskId).toBeNull();
        } finally {
            await db.execute(`DROP TRIGGER fail_task`);
        }
    });

    it('date : aujourd\'hui et aujourd\'hui + 5 ans acceptés', async () => {
        as(RESP_A);
        expect((await put({ appointmentDate: '2026-11-18' })).status).toBe(200);
        expect((await put({ appointmentDate: '2031-11-18' })).status).toBe(200);
    });

    it('garage retiré du partage : nom absent, contactId conservé, réenregistrement accepté', async () => {
        as(RESP_A);
        await put({ contactId: 'c-b-shared' });
        await db.execute(`UPDATE "FleetContact" SET shared = 0 WHERE id = 'c-b-shared'`);
        const ct = (await list()).controls.find(c => c.key === 'veh-184:CT');
        expect(ct?.appointment).toMatchObject({ contactId: 'c-b-shared', contactName: null });
        expect((await put({ contactId: 'c-b-shared', appointmentDate: '2026-12-01' })).status).toBe(200);
        expect((await put({ contactId: 'c-b-private' })).status).toBe(400);
    });

    it.each([
        ['date passée', { appointmentDate: '2026-11-17' }],
        ['date au-delà de 5 ans', { appointmentDate: '2031-11-19' }],
        ['type sans échéance pour ce véhicule (révision non configurée)', { controlType: 'REVISION' }],
        ['désinfection non suivie', { vehicleId: 'veh-186', controlType: 'DESINFECTION' }],
        ['type inconnu', { controlType: 'VIDANGE' }],
        ['date mal formée', { appointmentDate: '28/11/2026' }],
        ['date impossible', { appointmentDate: '2026-02-30' }],
        ['date absente', { appointmentDate: undefined }],
        ['notes trop longues', { notes: 'x'.repeat(501) }],
        ['champ inconnu', { ulId: 'ul-b' }],
        ['véhicule d\'une autre UL', { vehicleId: 'veh-b' }],
        ['véhicule inexistant', { vehicleId: 'nope' }],
        ['contact privé d\'une autre UL', { contactId: 'c-b-private' }],
        ['contact inexistant', { contactId: 'nope' }],
    ])('400 : %s', async (_label, body) => {
        as(RESP_A);
        const res = await put(body);
        expect(res.status).toBe(400);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetControlAppointment"`)).rows[0].n).toBe(0);
    });

    it('400 sur un corps illisible', async () => {
        as(RESP_A);
        const res = await putAppointment(new Request(`${BASE}/appointments`, { method: 'PUT', body: '{' }));
        expect(res.status).toBe(400);
    });

    it('rendez-vous d\'une autre UL invisible dans la liste', async () => {
        as(ADMIN_B);
        expect((await put({ vehicleId: 'veh-b', controlType: 'DESINFECTION' })).status).toBe(200);
        as(RESP_A);
        expect((await list()).controls.every(c => c.appointment === null)).toBe(true);
    });
});

describe('GET /controls — révision', () => {
    it('révision : échéance et kilomètres restants', async () => {
        await seedVehicle({ id: 'veh-rev', name: '75-190', plate: 'AA-190-AA', type: 'VL', ulId: 'ul-a', mileage: 55_000, revisionYearInterval: 1, revisionKmInterval: 20_000 });
        await db.execute(`INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage) VALUES ('rec-rev', 'veh-rev', '2025-12-05', 'REVISION', 40000)`);
        as(RESP_A);
        const rev = (await list()).controls.find(c => c.key === 'veh-rev:REVISION');
        expect(rev).toMatchObject({ dueDate: '2026-12-05', remainingKm: 5_000, state: 'TO_SCHEDULE', soon: true });
    });
});

describe('véhicule passé dans une autre UL', () => {
    it('le rendez-vous suit le véhicule : listé, remplacé (UL réalignée) et supprimable par la nouvelle UL', async () => {
        as(ADMIN_B);
        const { id } = await (await put({ vehicleId: 'veh-b', controlType: 'DESINFECTION' })).json() as { id: string };
        await db.execute(`UPDATE "Vehicle" SET ulId = 'ul-a' WHERE id = 'veh-b'`);

        expect((await list()).controls.some(c => c.vehicle.id === 'veh-b')).toBe(false);
        expect((await deleteAppointment(req('DELETE'), withId(id))).status).toBe(403);

        as(RESP_A);
        expect((await list()).controls.find(c => c.key === 'veh-b:DESINFECTION')?.appointment?.id).toBe(id);
        const replaced = await (await put({ vehicleId: 'veh-b', controlType: 'DESINFECTION', appointmentDate: '2026-11-30' })).json() as { id: string };
        expect(replaced.id).toBe(id);
        expect((await db.execute({ sql: `SELECT ulId FROM "FleetControlAppointment" WHERE id = ?`, args: [id] })).rows[0].ulId).toBe('ul-a');
        expect((await deleteAppointment(req('DELETE'), withId(id))).status).toBe(200);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetControlAppointment"`)).rows[0].n).toBe(0);
    });
});

describe('DELETE /controls/appointments/[id]', () => {
    it('supprime : la ligne redevient « À dater »', async () => {
        as(RESP_A);
        const { id } = await (await put({ createTask: true })).json() as { id: string };
        const res = await deleteAppointment(req('DELETE'), withId(id));
        expect(res.status).toBe(200);
        const ct = (await list()).controls.find(c => c.key === 'veh-184:CT');
        expect(ct).toMatchObject({ state: 'TO_SCHEDULE', appointment: null });
        // La tâche créée avec le rendez-vous est conservée.
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetTask"`)).rows[0].n).toBe(1);
    });

    it('403 pour un rendez-vous d\'une autre UL, 404 si introuvable', async () => {
        as(ADMIN_B);
        const { id } = await (await put({ vehicleId: 'veh-b', controlType: 'DESINFECTION' })).json() as { id: string };
        as(RESP_A);
        expect((await deleteAppointment(req('DELETE'), withId(id))).status).toBe(403);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetControlAppointment"`)).rows[0].n).toBe(1);
        expect((await deleteAppointment(req('DELETE'), withId('nope'))).status).toBe(404);
    });
});
