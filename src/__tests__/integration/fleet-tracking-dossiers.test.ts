/**
 * Tests d'intégration — suivi technique, dossiers :
 *   GET/POST /api/fleet-tracking/dossiers
 *   GET/PATCH/DELETE /api/fleet-tracking/dossiers/[id]
 *   POST /api/fleet-tracking/dossiers/[id]/items, PATCH/DELETE …/items/[itemId]
 *   GET /api/fleet-tracking/vehicles/[name]/history
 *   tâches : `dossierId` (création, modification, filtre `?dossier=`)
 *
 * `canManageVehicles`, cloisonné à l'UL de session ; véhicule du dossier dans l'UL ;
 * suppression d'un dossier : pièces et PJ supprimées, tâches conservées et détachées.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/push', () => ({ notifyUsers: vi.fn(async () => true) }));
vi.mock('@/lib/r2', () => ({
    deleteObject: vi.fn(async () => {}),
}));

import { GET as listDossiers, POST as postDossier } from '@/app/api/fleet-tracking/dossiers/route';
import { GET as getDossier, PATCH as patchDossier, DELETE as deleteDossier } from '@/app/api/fleet-tracking/dossiers/[id]/route';
import { POST as postItem } from '@/app/api/fleet-tracking/dossiers/[id]/items/route';
import { PATCH as patchItem, DELETE as deleteItem } from '@/app/api/fleet-tracking/dossiers/[id]/items/[itemId]/route';
import { GET as getHistory } from '@/app/api/fleet-tracking/vehicles/[name]/history/route';
import { GET as listTasks, POST as postTask } from '@/app/api/fleet-tracking/tasks/route';
import { PATCH as patchTask } from '@/app/api/fleet-tracking/tasks/[id]/route';
import { auth } from '@/auth';
import { deleteObject } from '@/lib/r2';
import { db, seedUniteLocale, seedUser, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);
const mockedDelete = vi.mocked(deleteObject);

const session = (roles: string[], ulId: string, id: string) =>
    ({ user: { id, email: `${id}@test.com`, name: `Nom ${id}`, ulId, roles } }) as never;

const RESP_A = session(['RESP_VEHICULE'], 'ul-a', 'u-resp-a');
const ADMIN_A = session(['ADMIN'], 'ul-a', 'u-admin-a');
const ADMIN_B = session(['ADMIN'], 'ul-b', 'u-admin-b');
const CHVL_A = session(['CHVL'], 'ul-a', 'u-chvl-a');

const BASE = 'http://localhost/api/fleet-tracking/dossiers';

function req(method: string, body?: unknown, url = BASE): Request {
    return new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}
const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const withItem = (id: string, itemId: string) => ({ params: Promise.resolve({ id, itemId }) });
const withName = (name: string) => ({ params: Promise.resolve({ name }) });

async function as(s: unknown) {
    mockedAuth.mockResolvedValue(s as never);
}

async function createDossier(body: Record<string, unknown> = {}, s: unknown = RESP_A): Promise<string> {
    await as(s);
    const res = await postDossier(req('POST', { vehicleId: 'veh-a', title: 'Sinistre roue arrière droite', ...body }));
    expect(res.status).toBe(201);
    return (await res.json() as { id: string }).id;
}

async function addItem(dossierId: string, label: string): Promise<string> {
    const res = await postItem(req('POST', { label }), withId(dossierId));
    expect(res.status).toBe(201);
    return (await res.json() as { id: string }).id;
}

async function dossierRow(id: string) {
    return (await db.execute({ sql: `SELECT * FROM "FleetDossier" WHERE id = ?`, args: [id] })).rows[0];
}

beforeEach(async () => {
    mockedAuth.mockReset();
    mockedDelete.mockClear();
    await seedUniteLocale({ id: 'ul-a', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-b', name: 'Paris 15', slug: 'paris-15' });
    await seedUser({ id: 'u-resp-a', email: 'resp-a@test.com', name: 'Camille Roux' });
    await seedVehicle({ id: 'veh-a', name: '75-188', plate: 'GV-114-QM', ulId: 'ul-a' });
    await seedVehicle({ id: 'veh-a2', name: '75-186', plate: 'AA-000-AA', ulId: 'ul-a' });
    await seedVehicle({ id: 'veh-b', name: '75-150', plate: 'BB-111-BB', ulId: 'ul-b' });
});

describe('accès', () => {
    it('401 sans session sur toutes les routes', async () => {
        await as(null);
        expect((await listDossiers(req('GET'))).status).toBe(401);
        expect((await postDossier(req('POST', { vehicleId: 'veh-a', title: 'X' }))).status).toBe(401);
        expect((await getDossier(req('GET'), withId('d'))).status).toBe(401);
        expect((await patchDossier(req('PATCH', { title: 'Y' }), withId('d'))).status).toBe(401);
        expect((await deleteDossier(req('DELETE'), withId('d'))).status).toBe(401);
        expect((await postItem(req('POST', { label: 'X' }), withId('d'))).status).toBe(401);
        expect((await patchItem(req('PATCH', { received: true }), withItem('d', 'i'))).status).toBe(401);
        expect((await deleteItem(req('DELETE'), withItem('d', 'i'))).status).toBe(401);
        expect((await getHistory(req('GET'), withName('75-188'))).status).toBe(401);
    });

    it('403 pour un CHVL', async () => {
        await as(CHVL_A);
        expect((await listDossiers(req('GET'))).status).toBe(403);
        expect((await postDossier(req('POST', { vehicleId: 'veh-a', title: 'X' }))).status).toBe(403);
        expect((await getDossier(req('GET'), withId('d'))).status).toBe(403);
        expect((await postItem(req('POST', { label: 'X' }), withId('d'))).status).toBe(403);
        expect((await getHistory(req('GET'), withName('75-188'))).status).toBe(403);
    });

    it('dossier d\'une autre UL : 403 en lecture, modification, suppression et sur ses pièces', async () => {
        const id = await createDossier();
        await as(RESP_A);
        const itemId = await addItem(id, 'Constat');
        await as(ADMIN_B);
        expect((await getDossier(req('GET'), withId(id))).status).toBe(403);
        expect((await patchDossier(req('PATCH', { title: 'Piraté' }), withId(id))).status).toBe(403);
        expect((await deleteDossier(req('DELETE'), withId(id))).status).toBe(403);
        expect((await postItem(req('POST', { label: 'X' }), withId(id))).status).toBe(403);
        expect((await patchItem(req('PATCH', { received: true }), withItem(id, itemId))).status).toBe(403);
        expect((await deleteItem(req('DELETE'), withItem(id, itemId))).status).toBe(403);
        expect(await dossierRow(id)).toBeTruthy();
        // Liste de l'UL B : vide.
        const list = await (await listDossiers(req('GET'))).json() as { dossiers: unknown[] };
        expect(list.dossiers).toHaveLength(0);
    });

    it('404 pour un dossier inconnu', async () => {
        await as(RESP_A);
        expect((await getDossier(req('GET'), withId('nope'))).status).toBe(404);
        expect((await patchDossier(req('PATCH', { title: 'Y' }), withId('nope'))).status).toBe(404);
        expect((await deleteDossier(req('DELETE'), withId('nope'))).status).toBe(404);
    });
});

describe('création et validation', () => {
    it('201 : véhicule de l\'UL + titre → état OPEN, véhicule et compteurs', async () => {
        await as(RESP_A);
        const res = await postDossier(req('POST', { vehicleId: 'veh-a', title: '  Sinistre roue  ', description: 'Jante voilée' }));
        expect(res.status).toBe(201);
        const json = await res.json() as { id: string; dossier: Record<string, unknown> };
        expect(json.dossier).toMatchObject({
            title: 'Sinistre roue', description: 'Jante voilée', status: 'OPEN', pinned: false, closedAt: null,
            vehicles: [{ id: 'veh-a', name: '75-188', plate: 'GV-114-QM', missing: false }],
            taskCount: 0, itemCount: 0, missingItemCount: 0, attachmentCount: 0, items: [], tasks: [], attachments: [],
        });
        const row = await dossierRow(json.id);
        expect(row.ulId).toBe('ul-a');
        expect(row.createdBy).toBe('u-resp-a');
    });

    it('400 : véhicule d\'une autre UL ou inconnu', async () => {
        await as(RESP_A);
        expect((await postDossier(req('POST', { vehicleId: 'veh-b', title: 'X' }))).status).toBe(400);
        expect((await postDossier(req('POST', { vehicleId: 'nope', title: 'X' }))).status).toBe(400);
    });

    it('400 (Zod) : titre manquant, trop long, champ inconnu (ulId), état inconnu, JSON illisible', async () => {
        await as(RESP_A);
        expect((await postDossier(req('POST', { vehicleId: 'veh-a' }))).status).toBe(400);
        expect((await postDossier(req('POST', { vehicleId: 'veh-a', title: 'x'.repeat(201) }))).status).toBe(400);
        expect((await postDossier(req('POST', { vehicleId: 'veh-a', title: 'X', description: 'x'.repeat(5001) }))).status).toBe(400);
        expect((await postDossier(req('POST', { vehicleId: 'veh-a', title: 'X', ulId: 'ul-b' }))).status).toBe(400);
        expect((await postDossier(req('POST', { vehicleId: 'veh-a', title: 'X', status: 'ARCHIVED' }))).status).toBe(400);
        expect((await postDossier(new Request(BASE, { method: 'POST', body: '{' }))).status).toBe(400);
        expect((await listDossiers(req('GET', undefined, `${BASE}?status=FOO`))).status).toBe(400);
    });
});

describe('liste', () => {
    it('filtres status, vehicle, pinned ; un autre responsable de l\'UL voit tout', async () => {
        const open = await createDossier({ title: 'Ouvert 188', pinned: true });
        const closed = await createDossier({ title: 'Clos 188' });
        const other = await createDossier({ title: 'Ouvert 186', vehicleId: 'veh-a2' });
        await as(RESP_A);
        await patchDossier(req('PATCH', { status: 'CLOSED', closeReason: 'REPAIRED' }), withId(closed));

        await as(ADMIN_A);
        const ids = async (qs: string) => ((await (await listDossiers(req('GET', undefined, `${BASE}${qs}`))).json()) as { dossiers: { id: string }[] }).dossiers.map(d => d.id).sort();
        expect(await ids('')).toEqual([open, closed, other].sort());
        expect(await ids('?status=OPEN')).toEqual([open, other].sort());
        expect(await ids('?status=CLOSED')).toEqual([closed]);
        expect(await ids('?vehicle=veh-a2')).toEqual([other]);
        expect(await ids('?pinned=1')).toEqual([open]);
    });
});

describe('modification', () => {
    it('clôture pose closedAt, réouverture l\'efface ; épingle et titre modifiables par un autre responsable', async () => {
        const id = await createDossier();
        await as(ADMIN_A);
        let res = await patchDossier(req('PATCH', { status: 'CLOSED', closeReason: 'REPAIRED' }), withId(id));
        expect(res.status).toBe(200);
        const closedAt = (await dossierRow(id)).closedAt;
        expect(closedAt).toBeTruthy();
        expect(((await res.json()) as { dossier: { status: string } }).dossier.status).toBe('CLOSED');

        // Re-clore ne change pas la date.
        await patchDossier(req('PATCH', { status: 'CLOSED', closeReason: 'REPAIRED' }), withId(id));
        expect((await dossierRow(id)).closedAt).toBe(closedAt);

        res = await patchDossier(req('PATCH', { status: 'OPEN', pinned: true, title: 'Nouveau titre' }), withId(id));
        expect(res.status).toBe(200);
        const row = await dossierRow(id);
        expect(row.closedAt).toBeNull();
        expect(row.status).toBe('OPEN');
        expect(row.pinned).toBe(1);
        expect(row.title).toBe('Nouveau titre');
    });

    it('vehicleId seul en PATCH → 400 (la liste passe par vehicleIds) ; corps vide → 400', async () => {
        const id = await createDossier();
        await as(RESP_A);
        expect((await patchDossier(req('PATCH', { vehicleId: 'veh-a2' }), withId(id))).status).toBe(400);
        expect((await patchDossier(req('PATCH', { vehicleId: 'veh-a2', title: 'Autre' }), withId(id))).status).toBe(400);
        expect((await dossierRow(id)).vehicleId).toBe('veh-a');
        expect((await dossierRow(id)).title).toBe('Sinistre roue arrière droite');
        expect((await patchDossier(req('PATCH', {}), withId(id))).status).toBe(400);
        expect((await patchDossier(req('PATCH', { status: 'DONE' }), withId(id))).status).toBe(400);
    });
});

describe('pièces à récupérer', () => {
    it('ajout, réception avec valeur (date + auteur), décochage (tout effacé), compteurs', async () => {
        const id = await createDossier();
        await as(RESP_A);
        const ref = await addItem(id, 'Référence du sinistre');
        await addItem(id, 'Devis de réparation');

        let res = await patchItem(req('PATCH', { received: true, receivedValue: 'SIN-4521' }), withItem(id, ref));
        expect(res.status).toBe(200);
        const item = ((await res.json()) as { item: Record<string, unknown> }).item;
        expect(item).toMatchObject({ received: true, receivedValue: 'SIN-4521', receivedByName: 'Camille Roux' });
        expect(item.receivedAt).toBeTruthy();

        let detail = ((await (await getDossier(req('GET'), withId(id))).json()) as { dossier: Record<string, unknown> & { items: { label: string }[] } }).dossier;
        expect(detail.itemCount).toBe(2);
        expect(detail.missingItemCount).toBe(1);
        expect(detail.items.map(i => i.label)).toEqual(['Référence du sinistre', 'Devis de réparation']);

        res = await patchItem(req('PATCH', { received: false }), withItem(id, ref));
        expect(res.status).toBe(200);
        const row = (await db.execute({ sql: `SELECT * FROM "FleetDossierItem" WHERE id = ?`, args: [ref] })).rows[0];
        expect(row).toMatchObject({ received: 0, receivedValue: null, receivedAt: null, receivedBy: null, attachmentId: null });

        detail = ((await (await getDossier(req('GET'), withId(id))).json()) as { dossier: Record<string, unknown> & { items: { label: string }[] } }).dossier;
        expect(detail.missingItemCount).toBe(2);
    });

    it('400 : PJ d\'un autre dossier, valeur sur une pièce non reçue, libellé vide ou trop long, valeur trop longue', async () => {
        const id = await createDossier();
        const other = await createDossier({ title: 'Autre' });
        await as(RESP_A);
        const item = await addItem(id, 'Devis');
        await db.execute({
            sql: `INSERT INTO "FleetAttachment" (id, ownerType, ownerId, ulId, r2Key, fileName, contentType, size, createdAt)
                  VALUES ('att-other', 'DOSSIER', ?, 'ul-a', 'k', 'devis.pdf', 'application/pdf', 10, 't'),
                         ('att-task', 'TASK', ?, 'ul-a', 'k2', 'devis.pdf', 'application/pdf', 10, 't')`,
            args: [other, id],
        });
        expect((await patchItem(req('PATCH', { received: true, attachmentId: 'att-other' }), withItem(id, item))).status).toBe(400);
        expect((await patchItem(req('PATCH', { received: true, attachmentId: 'att-task' }), withItem(id, item))).status).toBe(400);
        expect((await patchItem(req('PATCH', { receivedValue: 'X' }), withItem(id, item))).status).toBe(400);
        expect((await patchItem(req('PATCH', { received: true, receivedValue: 'x'.repeat(501) }), withItem(id, item))).status).toBe(400);
        expect((await patchItem(req('PATCH', {}), withItem(id, item))).status).toBe(400);
        expect((await postItem(req('POST', { label: ' ' }), withId(id))).status).toBe(400);
        expect((await postItem(req('POST', { label: 'x'.repeat(201) }), withId(id))).status).toBe(400);
        const row = (await db.execute({ sql: `SELECT received FROM "FleetDossierItem" WHERE id = ?`, args: [item] })).rows[0];
        expect(row.received).toBe(0);
    });

    it('51e pièce → 400', async () => {
        const id = await createDossier();
        await as(RESP_A);
        for (let i = 0; i < 50; i++) {
            await db.execute({
                sql: `INSERT INTO "FleetDossierItem" (id, dossierId, label, position, createdAt) VALUES (?, ?, ?, ?, 't')`,
                args: [`it-${i}`, id, `Pièce ${i}`, i],
            });
        }
        const res = await postItem(req('POST', { label: 'Une de trop' }), withId(id));
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toMatch(/au plus 50 pièces/);
        expect((await db.execute({ sql: `SELECT COUNT(*) AS n FROM "FleetDossierItem" WHERE dossierId = ?`, args: [id] })).rows[0].n).toBe(50);
    });

    it('réception avec une PJ du dossier ; supprimer la pièce ; pièce d\'un autre dossier → 404', async () => {
        const id = await createDossier();
        const other = await createDossier({ title: 'Autre' });
        await as(RESP_A);
        const item = await addItem(id, 'Constat');
        const otherItem = await addItem(other, 'Facture');
        await db.execute({
            sql: `INSERT INTO "FleetAttachment" (id, ownerType, ownerId, ulId, r2Key, fileName, contentType, size, createdAt)
                  VALUES ('att-1', 'DOSSIER', ?, 'ul-a', 'k', 'constat.pdf', 'application/pdf', 10, 't')`,
            args: [id],
        });
        const res = await patchItem(req('PATCH', { received: true, attachmentId: 'att-1' }), withItem(id, item));
        expect(res.status).toBe(200);
        expect(((await res.json()) as { item: Record<string, unknown> }).item).toMatchObject({ attachmentId: 'att-1', attachmentName: 'constat.pdf' });

        expect((await patchItem(req('PATCH', { received: true }), withItem(id, otherItem))).status).toBe(404);
        expect((await deleteItem(req('DELETE'), withItem(id, otherItem))).status).toBe(404);
        expect((await deleteItem(req('DELETE'), withItem(id, item))).status).toBe(200);
        expect((await db.execute({ sql: `SELECT COUNT(*) AS n FROM "FleetDossierItem" WHERE id = ?`, args: [item] })).rows[0].n).toBe(0);
        // La PJ reste dans le dossier.
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetAttachment" WHERE id = 'att-1'`)).rows[0].n).toBe(1);
    });
});

describe('suppression', () => {
    it('pièces et PJ supprimées (R2 compris) ; tâches gardées et détachées', async () => {
        const id = await createDossier();
        await as(RESP_A);
        for (const label of ['Constat', 'Photos', 'Devis']) await addItem(id, label);
        await db.execute({
            sql: `INSERT INTO "FleetAttachment" (id, ownerType, ownerId, ulId, r2Key, fileName, contentType, size, createdAt)
                  VALUES ('att-1', 'DOSSIER', ?, 'ul-a', 'fleet-tracking/paris-18/dossiers/x/att-1.pdf', 'constat.pdf', 'application/pdf', 10, 't')`,
            args: [id],
        });
        const taskIds: string[] = [];
        for (const title of ['Déclarer', 'Relancer']) {
            const res = await postTask(req('POST', { title, dossierId: id }, 'http://localhost/api/fleet-tracking/tasks'));
            expect(res.status).toBe(201);
            taskIds.push((await res.json() as { id: string }).id);
        }

        expect((await deleteDossier(req('DELETE'), withId(id))).status).toBe(200);
        expect(await dossierRow(id)).toBeUndefined();
        expect((await db.execute({ sql: `SELECT COUNT(*) AS n FROM "FleetDossierItem" WHERE dossierId = ?`, args: [id] })).rows[0].n).toBe(0);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetAttachment"`)).rows[0].n).toBe(0);
        expect(mockedDelete).toHaveBeenCalledWith('fleet-tracking/paris-18/dossiers/x/att-1.pdf');
        const tasks = (await db.execute(`SELECT id, dossierId FROM "FleetTask" ORDER BY id`)).rows;
        expect(tasks.map(t => String(t.id)).sort()).toEqual([...taskIds].sort());
        expect(tasks.every(t => t.dossierId === null)).toBe(true);
    });

    it('échec R2 : journalisé, la base reste cohérente', async () => {
        const id = await createDossier();
        await db.execute({
            sql: `INSERT INTO "FleetAttachment" (id, ownerType, ownerId, ulId, r2Key, fileName, contentType, size, createdAt)
                  VALUES ('att-1', 'DOSSIER', ?, 'ul-a', 'k-fail', 'a.pdf', 'application/pdf', 10, 't')`,
            args: [id],
        });
        mockedDelete.mockRejectedValueOnce(new Error('R2 indisponible'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await as(RESP_A);
        expect((await deleteDossier(req('DELETE'), withId(id))).status).toBe(200);
        expect(spy.mock.calls.some(c => String(c[0]).includes('k-fail'))).toBe(true);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetAttachment"`)).rows[0].n).toBe(0);
        spy.mockRestore();
    });
});

describe('tâches rattachées à un dossier', () => {
    const TASKS = 'http://localhost/api/fleet-tracking/tasks';

    it('création dans un dossier : hérite du dossier et du véhicule ; filtre ?dossier= ; compteurs', async () => {
        const id = await createDossier();
        await as(RESP_A);
        const res = await postTask(req('POST', { title: 'Confirmer le devis', dossierId: id }, TASKS));
        expect(res.status).toBe(201);
        const task = ((await res.json()) as { task: { dossierId: string; links: { type: string; id: string }[] } }).task;
        expect(task.dossierId).toBe(id);
        expect(task.links).toEqual([expect.objectContaining({ type: 'VEHICLE', id: 'veh-a' })]);
        await postTask(req('POST', { title: 'Hors dossier' }, TASKS));

        const list = await (await listTasks(req('GET', undefined, `${TASKS}?dossier=${id}`))).json() as { tasks: { title: string }[] };
        expect(list.tasks.map(t => t.title)).toEqual(['Confirmer le devis']);
        const none = await (await listTasks(req('GET', undefined, `${TASKS}?dossier=none`))).json() as { tasks: { title: string }[] };
        expect(none.tasks.map(t => t.title)).toEqual(['Hors dossier']);

        const detail = ((await (await getDossier(req('GET'), withId(id))).json()) as { dossier: { taskCount: number; openTaskCount: number; tasks: unknown[] } }).dossier;
        expect(detail).toMatchObject({ taskCount: 1, openTaskCount: 1 });
        expect(detail.tasks).toHaveLength(1);
    });

    it('dossier clos : y créer ou y déplacer une tâche → 400 ; garder le dossier actuel (clos) → 200', async () => {
        const id = await createDossier();
        await as(RESP_A);
        const res = await postTask(req('POST', { title: 'Dans le dossier', dossierId: id }, TASKS));
        const taskId = (await res.json() as { id: string }).id;
        const other = (await (await postTask(req('POST', { title: 'Ailleurs' }, TASKS))).json() as { id: string }).id;
        await patchDossier(req('PATCH', { status: 'CLOSED', closeReason: 'REPAIRED' }), withId(id));

        const created = await postTask(req('POST', { title: 'X', dossierId: id }, TASKS));
        expect(created.status).toBe(400);
        expect(((await created.json()) as { error: string }).error).toMatch(/clos/);
        expect((await patchTask(req('PATCH', { dossierId: id }, `${TASKS}/${other}`), withId(other))).status).toBe(400);
        // Dossier actuel inchangé (renvoyé par la modale) : accepté.
        expect((await patchTask(req('PATCH', { dossierId: id, title: 'Renommée' }, `${TASKS}/${taskId}`), withId(taskId))).status).toBe(200);
        expect((await db.execute({ sql: `SELECT title, dossierId FROM "FleetTask" WHERE id = ?`, args: [taskId] })).rows[0]).toMatchObject({ title: 'Renommée', dossierId: id });
    });

    it('déplacer une tâche dans un dossier ajoute le rattachement au véhicule du dossier (sans doublon)', async () => {
        const id = await createDossier();
        await as(RESP_A);
        const taskId = (await (await postTask(req('POST', { title: 'Hors dossier', links: [{ type: 'VEHICLE', id: 'veh-a2' }] }, TASKS))).json() as { id: string }).id;
        const res = await patchTask(req('PATCH', { dossierId: id }, `${TASKS}/${taskId}`), withId(taskId));
        expect(res.status).toBe(200);
        const links = (await db.execute({ sql: `SELECT targetType, targetId FROM "FleetTaskLink" WHERE taskId = ? ORDER BY targetId`, args: [taskId] })).rows;
        expect(links.map(l => `${l.targetType}:${l.targetId}`)).toEqual(['VEHICLE:veh-a', 'VEHICLE:veh-a2']);
        // Ressortir puis revenir : pas de doublon.
        await patchTask(req('PATCH', { dossierId: null }, `${TASKS}/${taskId}`), withId(taskId));
        await patchTask(req('PATCH', { dossierId: id }, `${TASKS}/${taskId}`), withId(taskId));
        expect((await db.execute({ sql: `SELECT COUNT(*) AS n FROM "FleetTaskLink" WHERE taskId = ?`, args: [taskId] })).rows[0].n).toBe(2);
    });

    it('liste de rattachements pleine (30) : le véhicule du dossier n\'est pas ajouté (création et déplacement)', async () => {
        const id = await createDossier();
        for (let i = 0; i < 30; i++) await seedVehicle({ id: `veh-x${i}`, name: `X-${i}`, plate: `XX-${i}`, ulId: 'ul-a' });
        const links = Array.from({ length: 30 }, (_, i) => ({ type: 'VEHICLE', id: `veh-x${i}` }));
        await as(RESP_A);
        const created = await postTask(req('POST', { title: 'Pleine', dossierId: id, links }, TASKS));
        expect(created.status).toBe(201);
        const createdId = (await created.json() as { id: string }).id;
        const count = async (taskId: string) => (await db.execute({ sql: `SELECT COUNT(*) AS n FROM "FleetTaskLink" WHERE taskId = ?`, args: [taskId] })).rows[0].n;
        expect(await count(createdId)).toBe(30);

        const moved = (await (await postTask(req('POST', { title: 'Pleine 2', links }, TASKS))).json() as { id: string }).id;
        expect((await patchTask(req('PATCH', { dossierId: id }, `${TASKS}/${moved}`), withId(moved))).status).toBe(200);
        expect(await count(moved)).toBe(30);
    });

    it('dossier dont le véhicule est passé dans une autre UL : tâche créée sans rattachement au véhicule', async () => {
        const id = await createDossier();
        await db.execute(`UPDATE "Vehicle" SET ulId = 'ul-b' WHERE id = 'veh-a'`);
        await as(RESP_A);
        const res = await postTask(req('POST', { title: 'Relancer', dossierId: id }, TASKS));
        expect(res.status).toBe(201);
        const task = ((await res.json()) as { task: { dossierId: string; links: unknown[] } }).task;
        expect(task.dossierId).toBe(id);
        expect(task.links).toEqual([]);
    });

    it('dossier d\'une autre UL ou inconnu → 400 (création et modification) ; détacher avec null', async () => {
        const idB = await createDossier({ vehicleId: 'veh-b' }, ADMIN_B);
        const idA = await createDossier();
        await as(RESP_A);
        expect((await postTask(req('POST', { title: 'X', dossierId: idB }, TASKS))).status).toBe(400);
        expect((await postTask(req('POST', { title: 'X', dossierId: 'nope' }, TASKS))).status).toBe(400);

        const res = await postTask(req('POST', { title: 'Y' }, TASKS));
        const taskId = (await res.json() as { id: string }).id;
        expect((await patchTask(req('PATCH', { dossierId: idB }, `${TASKS}/${taskId}`), withId(taskId))).status).toBe(400);
        expect((await patchTask(req('PATCH', { dossierId: idA }, `${TASKS}/${taskId}`), withId(taskId))).status).toBe(200);
        expect((await db.execute({ sql: `SELECT dossierId FROM "FleetTask" WHERE id = ?`, args: [taskId] })).rows[0].dossierId).toBe(idA);
        expect((await patchTask(req('PATCH', { dossierId: null }, `${TASKS}/${taskId}`), withId(taskId))).status).toBe(200);
        expect((await db.execute({ sql: `SELECT dossierId FROM "FleetTask" WHERE id = ?`, args: [taskId] })).rows[0].dossierId).toBeNull();
    });
});

describe('historique du véhicule', () => {
    it('1 dossier clos, 1 ouvert, 1 tâche hors dossier terminée → 3 entrées, plus récente en tête', async () => {
        const closed = await createDossier({ title: 'Remplacement batterie' });
        await db.execute({ sql: `UPDATE "FleetDossier" SET createdAt = '2025-03-14T10:00:00Z' WHERE id = ?`, args: [closed] });
        await as(RESP_A);
        await patchDossier(req('PATCH', { status: 'CLOSED', closeReason: 'REPAIRED' }), withId(closed));
        const open = await createDossier({ title: 'Bruit de freinage' });
        await db.execute({ sql: `UPDATE "FleetDossier" SET createdAt = '2026-11-02T10:00:00Z' WHERE id = ?`, args: [open] });

        const taskRes = await postTask(req('POST', { title: 'Révision 105 000 km', status: 'DONE', links: [{ type: 'VEHICLE', id: 'veh-a' }] }, 'http://localhost/api/fleet-tracking/tasks'));
        const taskId = (await taskRes.json() as { id: string }).id;
        await db.execute({ sql: `UPDATE "FleetTask" SET createdAt = '2026-01-09T10:00:00Z' WHERE id = ?`, args: [taskId] });
        // Bruits : tâche du dossier (pas d'entrée à part), tâche d'un autre véhicule, dossier d'un autre véhicule.
        await postTask(req('POST', { title: 'Dans le dossier', dossierId: open }, 'http://localhost/api/fleet-tracking/tasks'));
        await postTask(req('POST', { title: 'Autre véhicule', links: [{ type: 'VEHICLE', id: 'veh-a2' }] }, 'http://localhost/api/fleet-tracking/tasks'));
        await createDossier({ title: 'Autre', vehicleId: 'veh-a2' });

        await as(ADMIN_A);
        const res = await getHistory(req('GET'), withName('75-188'));
        expect(res.status).toBe(200);
        const json = await res.json() as { entries: { kind: string; dossier?: { id: string; status: string }; task?: { id: string } }[] };
        expect(json.entries.map(e => e.kind)).toEqual(['DOSSIER', 'TASK', 'DOSSIER']);
        expect(json.entries[0].dossier).toMatchObject({ id: open, status: 'OPEN' });
        expect(json.entries[1].task?.id).toBe(taskId);
        expect(json.entries[2].dossier).toMatchObject({ id: closed, status: 'CLOSED' });
    });

    it('tâche rattachée au véhicule mais rangée dans le dossier d\'un autre véhicule : présente', async () => {
        const otherDossier = await createDossier({ title: 'Dossier du 186', vehicleId: 'veh-a2' });
        await as(RESP_A);
        const res = await postTask(req('POST', { title: 'Comparer les deux devis', dossierId: otherDossier, links: [{ type: 'VEHICLE', id: 'veh-a' }] }, 'http://localhost/api/fleet-tracking/tasks'));
        const taskId = (await res.json() as { id: string }).id;
        const json = await (await getHistory(req('GET'), withName('75-188'))).json() as { entries: { kind: string; task?: { id: string } }[] };
        expect(json.entries).toEqual([expect.objectContaining({ kind: 'TASK', task: expect.objectContaining({ id: taskId }) })]);
    });

    it('homonyme dans une autre UL : chaque UL voit son propre véhicule', async () => {
        // Créé AVANT le véhicule de l'UL B pour qu'un `WHERE name = ?` seul le renvoie en premier.
        await db.execute(`DELETE FROM "Vehicle" WHERE id = 'veh-a'`);
        await seedVehicle({ id: 'veh-b-188', name: '75-188', plate: 'ZZ-999-ZZ', ulId: 'ul-b' });
        await seedVehicle({ id: 'veh-a', name: '75-188', plate: 'GV-114-QM', ulId: 'ul-a' });
        await createDossier({ title: 'Dossier A' });
        await createDossier({ title: 'Dossier B', vehicleId: 'veh-b-188' }, ADMIN_B);

        for (const [s, vehicleId, title] of [[RESP_A, 'veh-a', 'Dossier A'], [ADMIN_B, 'veh-b-188', 'Dossier B']] as const) {
            await as(s);
            const res = await getHistory(req('GET'), withName('75-188'));
            expect(res.status).toBe(200);
            const json = await res.json() as { vehicle: { id: string }; entries: { dossier?: { title: string } }[] };
            expect(json.vehicle.id).toBe(vehicleId);
            expect(json.entries.map(e => e.dossier?.title)).toEqual([title]);
        }
    });

    it('véhicule d\'une autre UL → 403, inconnu → 404', async () => {
        await as(RESP_A);
        expect((await getHistory(req('GET'), withName('75-150'))).status).toBe(403);
        expect((await getHistory(req('GET'), withName('99-999'))).status).toBe(404);
    });
});

describe('dossier sur plusieurs véhicules', () => {
    const links = async (id: string) =>
        (await db.execute({ sql: `SELECT vehicleId, position FROM "FleetDossierVehicle" WHERE dossierId = ? ORDER BY position`, args: [id] })).rows
            .map(r => [String(r.vehicleId), Number(r.position)]);

    it('201 : vehicleIds dans l\'ordre de choix, doublon retiré, premier véhicule dans FleetDossier.vehicleId', async () => {
        await as(RESP_A);
        const res = await postDossier(req('POST', { vehicleIds: ['veh-a2', 'veh-a', 'veh-a2'], title: 'Pneus hiver' }));
        expect(res.status).toBe(201);
        const json = await res.json() as { id: string; dossier: { vehicles: { id: string; name: string }[] } };
        expect(json.dossier.vehicles.map(v => v.id)).toEqual(['veh-a2', 'veh-a']);
        expect(await links(json.id)).toEqual([['veh-a2', 0], ['veh-a', 1]]);
        expect((await dossierRow(json.id)).vehicleId).toBe('veh-a2');
    });

    it('400 : liste vide, ou un véhicule hors de l\'UL (rien n\'est écrit)', async () => {
        const count = async () => [
            (await db.execute(`SELECT COUNT(*) AS n FROM "FleetDossier"`)).rows[0].n,
            (await db.execute(`SELECT COUNT(*) AS n FROM "FleetDossierVehicle"`)).rows[0].n,
        ];
        const before = await count();
        await as(RESP_A);
        expect((await postDossier(req('POST', { vehicleIds: [], title: 'X' }))).status).toBe(400);
        expect((await postDossier(req('POST', { vehicleIds: ['veh-a', 'veh-b'], title: 'X' }))).status).toBe(400);
        expect(await count()).toEqual(before);
    });

    it('PATCH vehicleIds remplace la liste ; un véhicule parti de l\'UL peut rester, pas en être ajouté', async () => {
        const id = await createDossier();
        await as(RESP_A);
        let res = await patchDossier(req('PATCH', { vehicleIds: ['veh-a', 'veh-a2'] }), withId(id));
        expect(res.status).toBe(200);
        expect(await links(id)).toEqual([['veh-a', 0], ['veh-a2', 1]]);

        // veh-a2 change d'UL : il reste dans le dossier (indisponible), conservable à la modification.
        await db.execute(`UPDATE "Vehicle" SET ulId = 'ul-b' WHERE id = 'veh-a2'`);
        const detail = await (await getDossier(req('GET'), withId(id))).json() as { dossier: { vehicles: { id: string; missing: boolean }[] } };
        expect(detail.dossier.vehicles).toEqual([expect.objectContaining({ id: 'veh-a', missing: false }), expect.objectContaining({ id: 'veh-a2', missing: true })]);
        expect((await patchDossier(req('PATCH', { vehicleIds: ['veh-a2', 'veh-a'], title: 'Renommé' }), withId(id))).status).toBe(200);
        expect((await dossierRow(id)).vehicleId).toBe('veh-a2');
        // Un véhicule d'une autre UL ne peut pas être AJOUTÉ.
        expect((await patchDossier(req('PATCH', { vehicleIds: ['veh-a', 'veh-b'] }), withId(id))).status).toBe(400);
        expect((await patchDossier(req('PATCH', { vehicleIds: [] }), withId(id))).status).toBe(400);
        res = await patchDossier(req('PATCH', { vehicleIds: ['veh-a'] }), withId(id));
        expect(await links(id)).toEqual([['veh-a', 0]]);
    });

    it('liste filtrée par véhicule et historique : le dossier apparaît pour chacun de ses véhicules', async () => {
        const id = await createDossier({ vehicleIds: ['veh-a', 'veh-a2'], vehicleId: undefined });
        await createDossier({ title: 'Seul', vehicleId: 'veh-a' });
        await as(RESP_A);
        const list = async (v: string) =>
            ((await (await listDossiers(req('GET', undefined, `${BASE}?vehicle=${v}`))).json()) as { dossiers: { id: string }[] }).dossiers.map(d => d.id);
        expect(await list('veh-a2')).toEqual([id]);
        expect(await list('veh-a')).toHaveLength(2);
        const history = await (await getHistory(req('GET'), withName('75-186'))).json() as { entries: { dossier?: { id: string } }[] };
        expect(history.entries.map(e => e.dossier?.id)).toEqual([id]);
    });

    it('tâche rangée dans le dossier : reçoit le rattachement à chacun de ses véhicules', async () => {
        const id = await createDossier({ vehicleIds: ['veh-a', 'veh-a2'], vehicleId: undefined });
        await as(RESP_A);
        const res = await postTask(req('POST', { title: 'Monter les pneus', dossierId: id }, 'http://localhost/api/fleet-tracking/tasks'));
        expect(res.status).toBe(201);
        const taskId = (await res.json() as { id: string }).id;
        const rows = (await db.execute({ sql: `SELECT targetId FROM "FleetTaskLink" WHERE taskId = ? AND targetType = 'VEHICLE'`, args: [taskId] })).rows;
        expect(rows.map(r => String(r.targetId)).sort()).toEqual(['veh-a', 'veh-a2']);
        // Rangée dans un dossier qui porte le véhicule : pas d'entrée à part dans son historique.
        const history = await (await getHistory(req('GET'), withName('75-186'))).json() as { entries: { kind: string }[] };
        expect(history.entries.map(e => e.kind)).toEqual(['DOSSIER']);
    });

    it('dossier antérieur à la reprise (sans ligne FleetDossierVehicle) : lu avec son vehicleId', async () => {
        const id = await createDossier();
        await db.execute({ sql: `DELETE FROM "FleetDossierVehicle" WHERE dossierId = ?`, args: [id] });
        await as(RESP_A);
        const detail = await (await getDossier(req('GET'), withId(id))).json() as { dossier: { vehicles: { id: string }[] } };
        expect(detail.dossier.vehicles.map(v => v.id)).toEqual(['veh-a']);
        const listed = await (await listDossiers(req('GET', undefined, `${BASE}?vehicle=veh-a`))).json() as { dossiers: { id: string }[] };
        expect(listed.dossiers.map(d => d.id)).toEqual([id]);
    });

    it('suppression : les véhicules du dossier sont retirés avec lui', async () => {
        const id = await createDossier({ vehicleIds: ['veh-a', 'veh-a2'], vehicleId: undefined });
        await as(RESP_A);
        expect((await deleteDossier(req('DELETE'), withId(id))).status).toBe(200);
        expect(await links(id)).toEqual([]);
    });
});
