/**
 * Tests d'intégration — suivi technique, tâches :
 *   GET/POST /api/fleet-tracking/tasks
 *   GET/PATCH/DELETE /api/fleet-tracking/tasks/[id]
 *   GET /api/fleet-tracking/assignees
 *   GET /api/fleet-tracking/link-targets
 *
 * `canManageVehicles`, cloisonné à l'UL de session ; assignés = responsables actifs de
 * l'UL ; rattachements dans le périmètre de l'UL (contact partagé accepté) ;
 * notification des seuls assignés nouvellement ajoutés, jamais l'auteur.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/push', () => ({ notifyUsers: vi.fn(async () => true) }));
const bucket = new Map<string, Buffer>();
vi.mock('@/lib/r2', () => ({
    deleteObject: vi.fn(async (key: string) => { bucket.delete(key); }),
}));

import { GET as listTasks, POST as postTask } from '@/app/api/fleet-tracking/tasks/route';
import { GET as getTask, PATCH as patchTask, DELETE as deleteTask } from '@/app/api/fleet-tracking/tasks/[id]/route';
import { GET as listAssignees } from '@/app/api/fleet-tracking/assignees/route';
import { GET as listTargets } from '@/app/api/fleet-tracking/link-targets/route';
import { auth } from '@/auth';
import { notifyUsers } from '@/lib/push';
import { deleteObject } from '@/lib/r2';
import { updateTask } from '@/lib/fleetTracking/tasksStore';
import { db, seedRoles, seedUniteLocale, seedUser, seedUserRole, seedUserUL, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);
const mockedNotify = vi.mocked(notifyUsers);
const mockedDelete = vi.mocked(deleteObject);

const session = (roles: string[], ulId: string, id: string) =>
    ({ user: { id, email: `${id}@test.com`, name: `Nom ${id}`, ulId, roles } }) as never;

const RESP_A = session(['RESP_VEHICULE'], 'ul-a', 'u-resp-a');
const ADMIN_A = session(['ADMIN'], 'ul-a', 'u-admin-a');
const ADMIN_B = session(['ADMIN'], 'ul-b', 'u-admin-b');
const CHVL_A = session(['CHVL'], 'ul-a', 'u-chvl-a');
const INACTIF_A = session(['RESP_VEHICULE', 'INACTIF'], 'ul-a', 'u-inactif-a');

const BASE = 'http://localhost/api/fleet-tracking/tasks';

function req(method: string, body?: unknown, url = BASE): Request {
    return new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

async function createAs(s: unknown, body: Record<string, unknown>) {
    mockedAuth.mockResolvedValue(s as never);
    const res = await postTask(req('POST', body));
    return { res, json: await res.json() as { id?: string; task?: Record<string, unknown>; error?: string } };
}

async function taskRow(id: string) {
    return (await db.execute({ sql: `SELECT * FROM "FleetTask" WHERE id = ?`, args: [id] })).rows[0];
}

async function seedPeople() {
    await seedRoles();
    // UL A : un responsable véhicule (rôles d'UL), un admin (rôles globaux), un CHVL, un responsable inactif.
    await seedUser({ id: 'u-resp-a', email: 'resp-a@test.com', name: 'Camille Roux' });
    await seedUserUL({ userId: 'u-resp-a', ulId: 'ul-a', isHome: true, roles: ['RESP_VEHICULE'] });
    await seedUser({ id: 'u-admin-a', email: 'admin-a@test.com', name: 'Thomas Leroy' });
    await seedUserRole('u-admin-a', 'ADMIN');
    await seedUserUL({ userId: 'u-admin-a', ulId: 'ul-a', isHome: true, roles: null });
    await seedUser({ id: 'u-chvl-a', email: 'chvl-a@test.com', name: 'Chauffeur A' });
    await seedUserUL({ userId: 'u-chvl-a', ulId: 'ul-a', isHome: true, roles: ['CHVL'] });
    await seedUser({ id: 'u-inactif-a', email: 'inactif-a@test.com', name: 'Inactif A' });
    await seedUserRole('u-inactif-a', 'INACTIF');
    await seedUserUL({ userId: 'u-inactif-a', ulId: 'ul-a', isHome: true, roles: ['RESP_VEHICULE'] });
    // UL B : un admin.
    await seedUser({ id: 'u-admin-b', email: 'admin-b@test.com', name: 'Admin B' });
    await seedUserUL({ userId: 'u-admin-b', ulId: 'ul-b', isHome: true, roles: ['ADMIN'] });
}

async function seedTargets() {
    await seedVehicle({ id: 'veh-a', name: '75-188', plate: 'GV-114-QM', ulId: 'ul-a' });
    await seedVehicle({ id: 'veh-a2', name: '75-186', plate: 'AA-000-AA', ulId: 'ul-a' });
    await seedVehicle({ id: 'veh-b', name: '75-150', plate: 'BB-111-BB', ulId: 'ul-b' });
    for (const [id, vehicleId] of [['inc-a', 'veh-a'], ['inc-b', 'veh-b']]) {
        await db.execute({
            sql: `INSERT INTO "IncidentReport" (id, vehicleId, userId, type, status, occurredAt) VALUES (?, ?, 'u-resp-a', 'ACCIDENT', 'SUBMITTED', '2026-11-14T10:00')`,
            args: [id, vehicleId],
        });
    }
    for (const [id, vehicleId] of [['mnt-a', 'veh-a2'], ['mnt-b', 'veh-b']]) {
        await db.execute({
            sql: `INSERT INTO "VehicleMaintenance" (id, vehicleId, startDate, reason) VALUES (?, ?, '2026-11-02', 'Pneus')`,
            args: [id, vehicleId],
        });
    }
    const contact = (id: string, ulId: string, name: string, shared: number) => db.execute({
        sql: `INSERT INTO "FleetContact" (id, ulId, name, category, phones, shared, createdAt, updatedAt)
              VALUES (?, ?, ?, 'GARAGE', ?, ?, 't', 't')`,
        args: [id, ulId, name, JSON.stringify([{ label: 'Atelier', number: '01 02 03 04 05' }]), shared],
    });
    await contact('ct-a', 'ul-a', 'MVR Évolution', 0);
    await contact('ct-b-shared', 'ul-b', 'Assureur flotte', 1);
    await contact('ct-b-private', 'ul-b', 'Garage privé B', 0);
}

beforeEach(async () => {
    mockedAuth.mockReset();
    mockedNotify.mockClear();
    mockedDelete.mockClear();
    bucket.clear();
    await seedUniteLocale({ id: 'ul-a', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-b', name: 'Paris 15', slug: 'paris-15' });
    await seedPeople();
    await seedTargets();
});

describe('accès', () => {
    it('401 sans session sur toutes les routes', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await listTasks(req('GET'))).status).toBe(401);
        expect((await postTask(req('POST', { title: 'X' }))).status).toBe(401);
        expect((await getTask(req('GET'), withId('t'))).status).toBe(401);
        expect((await patchTask(req('PATCH', { title: 'Y' }), withId('t'))).status).toBe(401);
        expect((await deleteTask(req('DELETE'), withId('t'))).status).toBe(401);
        expect((await listAssignees()).status).toBe(401);
        expect((await listTargets(req('GET', undefined, 'http://localhost/api/fleet-tracking/link-targets'))).status).toBe(401);
    });

    it('403 pour un CHVL ou un INACTIF', async () => {
        for (const s of [CHVL_A, INACTIF_A]) {
            mockedAuth.mockResolvedValue(s);
            expect((await listTasks(req('GET'))).status).toBe(403);
            expect((await postTask(req('POST', { title: 'X' }))).status).toBe(403);
            expect((await patchTask(req('PATCH', { title: 'Y' }), withId('t'))).status).toBe(403);
            expect((await deleteTask(req('DELETE'), withId('t'))).status).toBe(403);
            expect((await listAssignees()).status).toBe(403);
        }
    });

    it('tâche d\'une autre UL : 403 en GET, PATCH et DELETE', async () => {
        const { json } = await createAs(ADMIN_B, { title: 'Tâche de B' });
        mockedAuth.mockResolvedValue(RESP_A);
        expect((await getTask(req('GET'), withId(json.id!))).status).toBe(403);
        expect((await patchTask(req('PATCH', { status: 'DONE' }), withId(json.id!))).status).toBe(403);
        expect((await deleteTask(req('DELETE'), withId(json.id!))).status).toBe(403);
        expect(await taskRow(json.id!)).toBeDefined();
    });

    it('tâche inexistante : 404', async () => {
        mockedAuth.mockResolvedValue(RESP_A);
        expect((await getTask(req('GET'), withId('nope'))).status).toBe(404);
        expect((await patchTask(req('PATCH', { title: 'Y' }), withId('nope'))).status).toBe(404);
        expect((await deleteTask(req('DELETE'), withId('nope'))).status).toBe(404);
    });
});

describe('création', () => {
    it('201 avec assigné et véhicule : l\'assigné est notifié, l\'auteur non', async () => {
        const { res, json } = await createAs(RESP_A, {
            title: 'Confirmer le devis auprès du garage',
            description: 'Avec et sans peinture',
            priority: 'HIGH',
            dueDate: '2026-11-20',
            assigneeIds: ['u-admin-a', 'u-resp-a'],
            links: [{ type: 'VEHICLE', id: 'veh-a' }, { type: 'VEHICLE', id: 'veh-a' }],
        });
        expect(res.status).toBe(201);
        const row = await taskRow(json.id!);
        expect(row.ulId).toBe('ul-a');
        expect(row.status).toBe('TODO');
        expect(row.priority).toBe('HIGH');
        expect(row.completedAt).toBeNull();
        const task = json.task as { assignees: { id: string; name: string }[]; links: { label: string }[] };
        expect(task.assignees.map(a => a.id).sort()).toEqual(['u-admin-a', 'u-resp-a']);
        // Doublon de rattachement ignoré.
        expect(task.links).toHaveLength(1);
        expect(task.links[0].label).toBe('75-188');

        expect(mockedNotify).toHaveBeenCalledTimes(1);
        const call = mockedNotify.mock.calls[0][0];
        expect(call.userIds).toEqual(['u-admin-a']);
        expect(call.url).toBe(`/vehicles?vue=suivi&onglet=taches&tache=${json.id}`);
        expect(call.excludeUserId).toBe('u-resp-a');
    });

    it('auto-attribution : aucune notification', async () => {
        const { res } = await createAs(RESP_A, { title: 'Pour moi', assigneeIds: ['u-resp-a'] });
        expect(res.status).toBe(201);
        expect(mockedNotify).not.toHaveBeenCalled();
    });

    it('400 : titre absent ou trop long, champ inconnu, état ou échéance invalides', async () => {
        for (const body of [
            {},
            { title: '   ' },
            { title: 'x'.repeat(201) },
            { title: 'ok', ulId: 'ul-b' },
            { title: 'ok', status: 'ARCHIVED' },
            { title: 'ok', dueDate: '2026-02-30' },
            { title: 'ok', description: 'x'.repeat(5001) },
        ]) {
            const { res } = await createAs(RESP_A, body);
            expect(res.status).toBe(400);
        }
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetTask"`)).rows[0].n).toBe(0);
    });

    it('400 : assigné CHVL de l\'UL, inactif, ou ADMIN d\'une autre UL', async () => {
        for (const id of ['u-chvl-a', 'u-inactif-a', 'u-admin-b', 'inconnu']) {
            const { res, json } = await createAs(RESP_A, { title: 'X', assigneeIds: [id] });
            expect(res.status).toBe(400);
            expect(json.error).toMatch(/Assigné invalide/);
        }
        expect(mockedNotify).not.toHaveBeenCalled();
    });

    it('400 : véhicule, incident, maintenance ou contact privé d\'une autre UL ; cible inexistante', async () => {
        for (const link of [
            { type: 'VEHICLE', id: 'veh-b' },
            { type: 'INCIDENT', id: 'inc-b' },
            { type: 'MAINTENANCE', id: 'mnt-b' },
            { type: 'CONTACT', id: 'ct-b-private' },
            { type: 'VEHICLE', id: 'absent' },
            { type: 'DOSSIER', id: 'x' },
        ]) {
            const { res } = await createAs(RESP_A, { title: 'X', links: [link] });
            expect(res.status).toBe(400);
        }
    });

    it('contact partagé par une autre UL, incident et maintenance de l\'UL : acceptés', async () => {
        const { res, json } = await createAs(RESP_A, {
            title: 'Récupérer la référence du sinistre',
            links: [
                { type: 'CONTACT', id: 'ct-b-shared' },
                { type: 'INCIDENT', id: 'inc-a' },
                { type: 'MAINTENANCE', id: 'mnt-a' },
                { type: 'CONTACT', id: 'ct-a' },
            ],
        });
        expect(res.status).toBe(201);
        const links = (json.task as { links: { type: string; label: string; detail: string | null; phone: string | null }[] }).links;
        const shared = links.find(l => l.label === 'Assureur flotte')!;
        expect(shared.detail).toBe("Proposé par l'UL Paris 15");
        expect(shared.phone).toBe('01 02 03 04 05');
        expect(links.find(l => l.type === 'INCIDENT')!.label).toBe('Incident du 14/11/2026');
        expect(links.find(l => l.type === 'MAINTENANCE')!.detail).toBe('75-186 · Pneus');
    });

    it('échec de notification : la tâche est créée quand même (201, une ligne)', async () => {
        mockedNotify.mockRejectedValueOnce(new Error('push indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { res } = await createAs(RESP_A, { title: 'X', assigneeIds: ['u-admin-a'] });
        errorSpy.mockRestore();
        expect(res.status).toBe(201);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetTask"`)).rows[0].n).toBe(1);
    });

    it('contact partagé par une UL qui n\'existe plus : refusé, comme dans la recherche', async () => {
        await db.execute({
            sql: `INSERT INTO "FleetContact" (id, ulId, name, category, phones, shared, createdAt, updatedAt)
                  VALUES ('ct-orphan', 'ul-supprimee', 'Garage orphelin', 'GARAGE', '[]', 1, 't', 't')`,
            args: [],
        });
        const { res } = await createAs(RESP_A, { title: 'X', links: [{ type: 'CONTACT', id: 'ct-orphan' }] });
        expect(res.status).toBe(400);
        mockedAuth.mockResolvedValue(RESP_A);
        const search = await listTargets(req('GET', undefined, 'http://localhost/api/fleet-tracking/link-targets?type=CONTACT'));
        expect(((await search.json()) as { targets: { id: string }[] }).targets.map(t => t.id)).not.toContain('ct-orphan');
    });

    it('créée directement à Terminé : completedAt posé', async () => {
        const { json } = await createAs(RESP_A, { title: 'Déjà fait', status: 'DONE' });
        expect((await taskRow(json.id!)).completedAt).toBeTruthy();
    });
});

describe('modification', () => {
    it('passage à Terminé pose completedAt, la réouverture l\'efface ; l\'état persiste', async () => {
        const { json } = await createAs(RESP_A, { title: 'Changer les pneus' });
        mockedAuth.mockResolvedValue(ADMIN_A);
        expect((await patchTask(req('PATCH', { status: 'WAITING' }), withId(json.id!))).status).toBe(200);
        expect((await taskRow(json.id!)).status).toBe('WAITING');

        const done = await patchTask(req('PATCH', { status: 'DONE' }), withId(json.id!));
        expect(done.status).toBe(200);
        const completedAt = (await taskRow(json.id!)).completedAt;
        expect(completedAt).toBeTruthy();

        // Rester à DONE ne change pas la date.
        await patchTask(req('PATCH', { status: 'DONE', title: 'Changer les pneus avant' }), withId(json.id!));
        expect((await taskRow(json.id!)).completedAt).toBe(completedAt);

        await patchTask(req('PATCH', { status: 'TODO' }), withId(json.id!));
        const reopened = await taskRow(json.id!);
        expect(reopened.status).toBe('TODO');
        expect(reopened.completedAt).toBeNull();
    });

    it('remplacement des assignés : seuls les nouveaux sont notifiés, jamais l\'auteur', async () => {
        const { json } = await createAs(RESP_A, { title: 'Devis', assigneeIds: ['u-resp-a'] });
        mockedNotify.mockClear();

        mockedAuth.mockResolvedValue(RESP_A);
        const res = await patchTask(req('PATCH', { assigneeIds: ['u-resp-a', 'u-admin-a'] }), withId(json.id!));
        expect(res.status).toBe(200);
        expect(mockedNotify).toHaveBeenCalledTimes(1);
        expect(mockedNotify.mock.calls[0][0].userIds).toEqual(['u-admin-a']);

        mockedNotify.mockClear();
        mockedAuth.mockResolvedValue(ADMIN_A);
        await patchTask(req('PATCH', { assigneeIds: ['u-admin-a'] }), withId(json.id!));
        expect(mockedNotify).not.toHaveBeenCalled();
        const ids = (await db.execute({ sql: `SELECT userId FROM "FleetTaskAssignee" WHERE taskId = ?`, args: [json.id!] })).rows.map(r => r.userId);
        expect(ids).toEqual(['u-admin-a']);
    });

    it('remplacement des rattachements ; vider la liste', async () => {
        const { json } = await createAs(RESP_A, { title: 'X', links: [{ type: 'VEHICLE', id: 'veh-a' }] });
        mockedAuth.mockResolvedValue(RESP_A);
        await patchTask(req('PATCH', { links: [{ type: 'VEHICLE', id: 'veh-a2' }, { type: 'CONTACT', id: 'ct-a' }] }), withId(json.id!));
        let links = (await db.execute({ sql: `SELECT targetId FROM "FleetTaskLink" WHERE taskId = ? ORDER BY targetId`, args: [json.id!] })).rows.map(r => r.targetId);
        expect(links).toEqual(['ct-a', 'veh-a2']);
        await patchTask(req('PATCH', { links: [] }), withId(json.id!));
        links = (await db.execute({ sql: `SELECT targetId FROM "FleetTaskLink" WHERE taskId = ?`, args: [json.id!] })).rows.map(r => r.targetId);
        expect(links).toEqual([]);
    });

    it('400 : corps vide, assigné ou rattachement invalide', async () => {
        const { json } = await createAs(RESP_A, { title: 'X' });
        mockedAuth.mockResolvedValue(RESP_A);
        expect((await patchTask(req('PATCH', {}), withId(json.id!))).status).toBe(400);
        expect((await patchTask(req('PATCH', { assigneeIds: ['u-chvl-a'] }), withId(json.id!))).status).toBe(400);
        expect((await patchTask(req('PATCH', { links: [{ type: 'INCIDENT', id: 'inc-b' }] }), withId(json.id!))).status).toBe(400);
        expect((await patchTask(req('PATCH', { pinned: 'oui' }), withId(json.id!))).status).toBe(400);
    });

    it('un assigné qui a perdu son rôle depuis reste accepté (200)', async () => {
        const { json } = await createAs(RESP_A, { title: 'X', assigneeIds: ['u-admin-a'] });
        await db.execute(`DELETE FROM "UserRole" WHERE userId = 'u-admin-a'`);
        await seedUserUL({ userId: 'u-admin-a', ulId: 'ul-a', isHome: true, roles: ['CHVL'] });
        mockedAuth.mockResolvedValue(RESP_A);
        const res = await patchTask(req('PATCH', { title: 'Y', assigneeIds: ['u-admin-a'] }), withId(json.id!));
        expect(res.status).toBe(200);
        // Mais il n'est plus assignable à une autre tâche.
        expect((await createAs(RESP_A, { title: 'Z', assigneeIds: ['u-admin-a'] })).res.status).toBe(400);
    });

    it('échec de notification à la modification : 200', async () => {
        const { json } = await createAs(RESP_A, { title: 'X' });
        mockedNotify.mockRejectedValueOnce(new Error('push indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockedAuth.mockResolvedValue(RESP_A);
        const res = await patchTask(req('PATCH', { assigneeIds: ['u-admin-a'] }), withId(json.id!));
        errorSpy.mockRestore();
        expect(res.status).toBe(200);
    });

    it('tâche supprimée entre-temps : aucun assigné ni rattachement orphelin inséré', async () => {
        const ok = await updateTask('disparue', 'ul-a', { status: 'TODO' }, {
            title: 'X', assigneeIds: ['u-admin-a'], links: [{ type: 'VEHICLE', id: 'veh-a' }],
        });
        expect(ok).toBe(false);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetTaskAssignee"`)).rows[0].n).toBe(0);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetTaskLink"`)).rows[0].n).toBe(0);
    });

    it('un rattachement déjà présent reste accepté même si le contact n\'est plus partagé', async () => {
        const { json } = await createAs(RESP_A, { title: 'X', links: [{ type: 'CONTACT', id: 'ct-b-shared' }] });
        await db.execute(`UPDATE "FleetContact" SET shared = 0 WHERE id = 'ct-b-shared'`);
        mockedAuth.mockResolvedValue(RESP_A);
        const res = await patchTask(req('PATCH', { title: 'Y', links: [{ type: 'CONTACT', id: 'ct-b-shared' }] }), withId(json.id!));
        expect(res.status).toBe(200);
        const task = (await res.json() as { task: { links: { missing: boolean; phone: string | null }[] } }).task;
        // Plus visible depuis l'UL : le lien reste, sans détail.
        expect(task.links[0].missing).toBe(true);
        expect(task.links[0].phone).toBeNull();
    });
});

describe('liste et filtres', () => {
    it('ne renvoie que les tâches de l\'UL et applique chaque filtre', async () => {
        const t1 = (await createAs(RESP_A, {
            title: 'Demander un devis carrosserie', priority: 'HIGH', pinned: true,
            assigneeIds: ['u-resp-a'], links: [{ type: 'VEHICLE', id: 'veh-a' }],
        })).json.id!;
        const t2 = (await createAs(RESP_A, {
            title: 'Remplacer les balais', assigneeIds: ['u-admin-a'], links: [{ type: 'INCIDENT', id: 'inc-a' }],
        })).json.id!;
        const t3 = (await createAs(RESP_A, { title: 'Contrôle technique', description: 'devis à joindre', status: 'DONE' })).json.id!;
        await createAs(ADMIN_B, { title: 'Devis de B' });

        mockedAuth.mockResolvedValue(RESP_A);
        const ids = async (qs: string) => {
            const res = await listTasks(req('GET', undefined, `${BASE}${qs}`));
            expect(res.status).toBe(200);
            return ((await res.json()) as { tasks: { id: string }[] }).tasks.map(t => t.id).sort();
        };
        expect(await ids('')).toEqual([t1, t2, t3].sort());
        expect(await ids('?vehicle=veh-a')).toEqual([t1, t2].sort());
        expect(await ids('?assignee=me')).toEqual([t1]);
        expect(await ids('?assignee=u-admin-a')).toEqual([t2]);
        expect(await ids('?pinned=1')).toEqual([t1]);
        expect(await ids('?priority=HIGH')).toEqual([t1]);
        expect(await ids('?status=DONE')).toEqual([t3]);
        expect(await ids('?status=TODO,DONE')).toEqual([t1, t2, t3].sort());
        expect(await ids('?q=devis')).toEqual([t1, t3].sort());
        expect(await ids('?vehicle=veh-a&assignee=me&pinned=1&priority=HIGH&q=devis')).toEqual([t1]);
        expect((await listTasks(req('GET', undefined, `${BASE}?status=ARCHIVED`))).status).toBe(400);
        expect((await listTasks(req('GET', undefined, `${BASE}?priority=URGENT`))).status).toBe(400);
    });

    it('?vehicle= retrouve une tâche rattachée seulement à une maintenance de ce véhicule', async () => {
        const id = (await createAs(RESP_A, { title: 'Pneus', links: [{ type: 'MAINTENANCE', id: 'mnt-a' }] })).json.id!;
        mockedAuth.mockResolvedValue(RESP_A);
        const res = await listTasks(req('GET', undefined, `${BASE}?vehicle=veh-a2`));
        expect(((await res.json()) as { tasks: { id: string }[] }).tasks.map(t => t.id)).toEqual([id]);
        const other = await listTasks(req('GET', undefined, `${BASE}?vehicle=veh-a`));
        expect(((await other.json()) as { tasks: unknown[] }).tasks).toEqual([]);
    });

    it('GET d\'une tâche : assignés nommés, rattachements, pièces jointes', async () => {
        const { json } = await createAs(RESP_A, { title: 'X', assigneeIds: ['u-admin-a'], links: [{ type: 'VEHICLE', id: 'veh-a' }] });
        mockedAuth.mockResolvedValue(ADMIN_A);
        const res = await getTask(req('GET'), withId(json.id!));
        expect(res.status).toBe(200);
        const task = (await res.json() as { task: { assignees: { name: string }[]; links: { vehicleName: string }[]; attachments: unknown[] } }).task;
        expect(task.assignees[0].name).toBe('Thomas Leroy');
        expect(task.links[0].vehicleName).toBe('75-188');
        expect(task.attachments).toEqual([]);
    });
});

describe('suppression', () => {
    it('supprime tâche, liens, assignés, pièces jointes et objets R2 ; un échec R2 ne bloque pas', async () => {
        const { json } = await createAs(RESP_A, { title: 'X', assigneeIds: ['u-admin-a'], links: [{ type: 'VEHICLE', id: 'veh-a' }] });
        const id = json.id!;
        for (const n of [1, 2]) {
            const key = `fleet-tracking/paris-18/tasks/${id}/att-${n}.pdf`;
            bucket.set(key, Buffer.from('%PDF'));
            await db.execute({
                sql: `INSERT INTO "FleetAttachment" (id, ownerType, ownerId, ulId, r2Key, fileName, contentType, size, createdAt)
                      VALUES (?, 'TASK', ?, 'ul-a', ?, 'devis.pdf', 'application/pdf', 4, 't')`,
                args: [`att-${n}`, id, key],
            });
        }
        // Le premier objet échoue côté R2 : journalisé, la base est nettoyée quand même.
        mockedDelete.mockRejectedValueOnce(new Error('R2 indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        mockedAuth.mockResolvedValue(ADMIN_A);
        const res = await deleteTask(req('DELETE'), withId(id));
        expect(res.status).toBe(200);
        expect(mockedDelete).toHaveBeenCalledTimes(2);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
        expect(bucket.size).toBe(1);
        for (const table of ['FleetTask', 'FleetAttachment', 'FleetTaskLink', 'FleetTaskAssignee']) {
            expect((await db.execute(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n).toBe(0);
        }
    });
});

describe('assignables et cibles de rattachement', () => {
    it('ne propose que les responsables actifs de l\'UL', async () => {
        mockedAuth.mockResolvedValue(RESP_A);
        const res = await listAssignees();
        expect(res.status).toBe(200);
        const list = (await res.json() as { assignees: { id: string; roleLabel: string }[] }).assignees;
        expect(list.map(a => a.id).sort()).toEqual(['u-admin-a', 'u-resp-a']);
        expect(list.find(a => a.id === 'u-admin-a')!.roleLabel).toBe('Administrateur');
    });

    it('membre multi-UL : ses rôles DANS l\'UL de la tâche décident', async () => {
        // ADMIN dans sa home (ul-b) mais seulement CHVL dans ul-a → non assignable dans ul-a.
        await seedUser({ id: 'u-multi-1', email: 'm1@test.com', name: 'Multi Un' });
        await seedUserUL({ userId: 'u-multi-1', ulId: 'ul-b', isHome: true, roles: ['ADMIN'] });
        await seedUserUL({ userId: 'u-multi-1', ulId: 'ul-a', isHome: false, roles: ['CHVL'] });
        // CHVL dans sa home (ul-b) mais RESP_VEHICULE dans ul-a → assignable dans ul-a.
        await seedUser({ id: 'u-multi-2', email: 'm2@test.com', name: 'Multi Deux' });
        await seedUserUL({ userId: 'u-multi-2', ulId: 'ul-b', isHome: true, roles: ['CHVL'] });
        await seedUserUL({ userId: 'u-multi-2', ulId: 'ul-a', isHome: false, roles: ['RESP_VEHICULE'] });

        mockedAuth.mockResolvedValue(RESP_A);
        const ids = ((await (await listAssignees()).json()) as { assignees: { id: string }[] }).assignees.map(a => a.id);
        expect(ids).toContain('u-multi-2');
        expect(ids).not.toContain('u-multi-1');
        expect((await createAs(RESP_A, { title: 'X', assigneeIds: ['u-multi-1'] })).res.status).toBe(400);
        expect((await createAs(RESP_A, { title: 'X', assigneeIds: ['u-multi-2'] })).res.status).toBe(201);
    });

    it('tous les véhicules de l\'UL sans recherche (filtre par véhicule), pas de plafond', async () => {
        for (let i = 0; i < 35; i++) await seedVehicle({ id: `veh-x${i}`, name: `VL-${String(i).padStart(2, '0')}`, plate: null as never, ulId: 'ul-a' });
        mockedAuth.mockResolvedValue(RESP_A);
        const res = await listTargets(req('GET', undefined, 'http://localhost/api/fleet-tracking/link-targets?type=VEHICLE'));
        expect(((await res.json()) as { targets: unknown[] }).targets).toHaveLength(37);
    });

    it('cibles par type, dans le périmètre de l\'UL, avec recherche', async () => {
        mockedAuth.mockResolvedValue(RESP_A);
        const targets = async (qs: string) => {
            const res = await listTargets(req('GET', undefined, `http://localhost/api/fleet-tracking/link-targets${qs}`));
            expect(res.status).toBe(200);
            return ((await res.json()) as { targets: { type: string; id: string }[] }).targets;
        };
        expect((await targets('?type=VEHICLE')).map(t => t.id).sort()).toEqual(['veh-a', 'veh-a2']);
        expect((await targets('?type=VEHICLE&q=GV-114')).map(t => t.id)).toEqual(['veh-a']);
        expect((await targets('?type=CONTACT')).map(t => t.id).sort()).toEqual(['ct-a', 'ct-b-shared']);
        expect((await targets('?type=INCIDENT')).map(t => t.id)).toEqual(['inc-a']);
        expect((await targets('?type=MAINTENANCE')).map(t => t.id)).toEqual(['mnt-a']);
        const all = await targets('?q=75-18');
        expect(new Set(all.map(t => t.type))).toEqual(new Set(['VEHICLE', 'INCIDENT', 'MAINTENANCE']));
        expect((await listTargets(req('GET', undefined, 'http://localhost/api/fleet-tracking/link-targets?type=DOSSIER'))).status).toBe(400);
    });
});
