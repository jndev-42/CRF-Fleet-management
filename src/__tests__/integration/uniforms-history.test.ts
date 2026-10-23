/**
 * Tests d'intégration — historique des uniformes et rôle RESP_UNIFORME :
 *   GET /api/uniforms/history                       (journal paginé)
 *   POST|PATCH|DELETE /api/uniforms/items*          (gardes `canManageUniforms`)
 *   GET /api/uniforms/qr-token                      (CADRE conservé, RESP_UNIFORME ajouté)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/drive', () => ({ deleteDriveFolder: vi.fn() }));
vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
    getRenaultVehicleData: vi.fn().mockResolvedValue(null),
    isConnectedInDb: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/push', () => ({
    sendPushNotification: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
    notifyRoles: vi.fn().mockResolvedValue(undefined),
}));

import { GET as getHistory } from '@/app/api/uniforms/history/route';
import { GET as getUsers } from '@/app/api/users/route';
import { PATCH as patchVehicle } from '@/app/api/vehicles/[id]/route';
import { POST as adjustStock } from '@/app/api/inventory/adjust/route';
import { POST as postItem } from '@/app/api/uniforms/items/route';
import { PATCH as patchItem, DELETE as deleteItem } from '@/app/api/uniforms/items/[id]/route';
import { POST as postSize } from '@/app/api/uniforms/items/[id]/sizes/route';
import { PATCH as patchSize, DELETE as deleteSize } from '@/app/api/uniforms/items/[id]/sizes/[sizeId]/route';
import { GET as getToken, DELETE as deleteToken } from '@/app/api/uniforms/qr-token/route';
import { encodeCursor, listUlHistory } from '@/lib/uniforms/history';
import { auth } from '@/auth';
import { db, seedUniteLocale, seedUniformItem, seedUniformSize, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);

const session = (roles: string[], id = 'u-x', ulId = 'ul-paris-18') =>
    ({ user: { id, email: `${id}@test.com`, name: id, ulId, roles } }) as never;

const ADMIN_18 = session(['ADMIN'], 'u-admin');
const RESP_18 = session(['RESP_UNIFORME'], 'u-resp');
const RESP_4 = session(['RESP_UNIFORME'], 'u-resp4', 'ul-paris-4');
const CADRE_18 = session(['CADRE'], 'u-cadre');
const PRESIDENT_18 = session(['PRESIDENT'], 'u-pres');
const CHVL_18 = session(['CHVL'], 'u-chvl');

const hist = (qs = '') => new Request(`http://localhost/api/uniforms/history${qs}`);
const json = (method: string, body?: unknown) => new Request('http://localhost/api/uniforms/items', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});
const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const withSize = (id: string, sizeId: string) => ({ params: Promise.resolve({ id, sizeId }) });

async function batch(id: string, at: string, borrowerName: string | null, ulId = 'ul-paris-18', email: string | null = null) {
    await db.execute({
        sql: `INSERT INTO "UniformLoanBatch" (id, ulId, borrowerId, borrowerName, borrowerEmail, source, createdAt) VALUES (?, ?, ?, ?, ?, 'app', ?)`,
        args: [id, ulId, `b-${id}`, borrowerName, email, at],
    });
}

async function loan(id: string, batchId: string, sizeId: string, extra: Partial<{
    returnedAt: string; returnedClean: number; returnComment: string; washedAt: string; washedByName: string;
}> = {}) {
    await db.execute({
        sql: `INSERT INTO "UniformLoan" (id, batchId, sizeId, borrowerId, borrowedAt, returnedAt, returnedClean, returnComment, washedAt, washedByName)
              VALUES (?, ?, ?, ?, (SELECT createdAt FROM "UniformLoanBatch" WHERE id = ?), ?, ?, ?, ?, ?)`,
        args: [id, batchId, sizeId, `b-${batchId}`, batchId, extra.returnedAt ?? null, extra.returnedClean ?? null,
            extra.returnComment ?? null, extra.washedAt ?? null, extra.washedByName ?? null],
    });
}

beforeEach(async () => {
    mockedAuth.mockReset();
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-paris-4', name: 'Paris 4', slug: 'paris-4' });
    await seedUniformItem({ id: 'polo', name: 'Polo' });
    await seedUniformSize({ id: 'polo-m', itemId: 'polo', label: 'M', quantity: 50 });
    await seedUniformSize({ id: 'polo-l', itemId: 'polo', label: 'L', quantity: 50 });
    await seedUniformItem({ id: 'veste', name: 'Veste' });
    await seedUniformSize({ id: 'veste-m', itemId: 'veste', label: 'M', quantity: 50 });
    await seedUniformItem({ id: 'veste-4', ulId: 'ul-paris-4', name: 'Parka' });
    await seedUniformSize({ id: 'parka-m', itemId: 'veste-4', label: 'M', quantity: 50 });
});

describe('GET /api/uniforms/history — accès', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await getHistory(hist())).status).toBe(401);
    });

    it('403 pour CADRE, PRESIDENT, CHVL et pour RESP_UNIFORME + INACTIF', async () => {
        for (const s of [CADRE_18, PRESIDENT_18, CHVL_18, session(['RESP_UNIFORME', 'INACTIF']), session(['ADMIN', 'INACTIF'])]) {
            mockedAuth.mockResolvedValue(s);
            expect((await getHistory(hist())).status).toBe(403);
        }
    });

    it('200 pour ADMIN et RESP_UNIFORME', async () => {
        for (const s of [ADMIN_18, RESP_18]) {
            mockedAuth.mockResolvedValue(s);
            const res = await getHistory(hist());
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ events: [], nextCursor: null, hasMore: false });
        }
    });

    it('liste vide sans UL active', async () => {
        mockedAuth.mockResolvedValue(session(['ADMIN'], 'u-admin', 'default'));
        expect(await (await getHistory(hist())).json()).toEqual({ events: [], nextCursor: null, hasMore: false });
    });

    it('400 : type inconnu, curseur invalide, recherche trop longue', async () => {
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await getHistory(hist('?type=bogus'))).status).toBe(400);
        expect((await getHistory(hist('?cursor=%25%25'))).status).toBe(400);
        expect((await getHistory(hist(`?cursor=${Buffer.from('{"x":1}').toString('base64url')}`))).status).toBe(400);
        expect((await getHistory(hist(`?q=${'a'.repeat(101)}`))).status).toBe(400);
    });
});

describe('GET /api/uniforms/history — journal', () => {
    it('emprunt, rendu, rendu groupé « Tout rendre » et lavage, du plus récent au plus ancien', async () => {
        await batch('b1', '2026-09-01T08:00:00.000Z', 'Camille');
        await loan('l1', 'b1', 'polo-m', { returnedAt: '2026-09-01T09:00:00.000Z', returnedClean: 0, returnComment: 'Boue', washedAt: '2026-09-02T10:00:00.000Z', washedByName: 'Alex' });
        await loan('l2', 'b1', 'polo-l', { returnedAt: '2026-09-01T11:00:00.000Z', returnedClean: 1 });
        await loan('l3', 'b1', 'veste-m', { returnedAt: '2026-09-01T11:00:00.000Z', returnedClean: 1 });

        mockedAuth.mockResolvedValue(RESP_18);
        const { events } = await (await getHistory(hist())).json();
        expect(events.map((e: { type: string }) => e.type)).toEqual(['wash', 'return', 'return', 'loan']);

        const [wash, groupedReturn, dirtyReturn, loanEvent] = events;
        expect(wash).toMatchObject({ key: 'wash:l1', at: '2026-09-02T10:00:00.000Z', washedByName: 'Alex', borrowerName: 'Camille' });
        expect(wash.pieces).toEqual([{ loanId: 'l1', itemName: 'Polo', sizeLabel: 'M' }]);

        // « Tout rendre » : un seul événement de 2 pièces au même instant.
        expect(groupedReturn).toMatchObject({ at: '2026-09-01T11:00:00.000Z', returnedClean: true });
        expect(groupedReturn.pieces).toHaveLength(2);

        expect(dirtyReturn).toMatchObject({ returnedClean: false, returnComment: 'Boue' });
        expect(dirtyReturn.pieces).toHaveLength(1);

        expect(loanEvent).toMatchObject({ key: 'loan:b1', borrowerName: 'Camille', source: 'app' });
        expect(loanEvent.pieces).toHaveLength(3);
    });

    it('cloisonnement : pièces de l\'UL de session seulement, quelle que soit l\'UL de l\'emprunteur', async () => {
        await batch('b18', '2026-09-01T08:00:00.000Z', 'Sam UL4');
        await loan('l18', 'b18', 'polo-m');
        await batch('b4', '2026-09-01T09:00:00.000Z', 'Camille', 'ul-paris-4');
        await loan('l4', 'b4', 'parka-m');

        mockedAuth.mockResolvedValue(ADMIN_18);
        const ul18 = (await (await getHistory(hist())).json()).events;
        expect(ul18.map((e: { key: string }) => e.key)).toEqual(['loan:b18']);

        mockedAuth.mockResolvedValue(RESP_4);
        const ul4 = (await (await getHistory(hist())).json()).events;
        expect(ul4.map((e: { key: string }) => e.key)).toEqual(['loan:b4']);
    });

    it('articles et tailles archivés restent dans le journal', async () => {
        await batch('b1', '2026-09-01T08:00:00.000Z', 'Camille');
        await loan('l1', 'b1', 'polo-m', { returnedAt: '2026-09-01T09:00:00.000Z', returnedClean: 1 });
        await db.execute(`UPDATE "UniformSize" SET archivedAt = '2026-09-03' WHERE id = 'polo-m'`);
        await db.execute(`UPDATE "UniformItem" SET archivedAt = '2026-09-03' WHERE id = 'polo'`);

        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await (await getHistory(hist())).json()).events).toHaveLength(2);
    });

    it('filtre par type', async () => {
        await batch('b1', '2026-09-01T08:00:00.000Z', 'Camille');
        await loan('l1', 'b1', 'polo-m', { returnedAt: '2026-09-01T09:00:00.000Z', returnedClean: 0, washedAt: '2026-09-01T10:00:00.000Z', washedByName: 'Alex' });

        mockedAuth.mockResolvedValue(ADMIN_18);
        for (const [type, expected] of [['loan', ['loan']], ['return', ['return']], ['wash', ['wash']], ['all', ['wash', 'return', 'loan']]] as const) {
            const { events } = await (await getHistory(hist(`?type=${type}`))).json();
            expect(events.map((e: { type: string }) => e.type), type).toEqual(expected);
        }
    });

    it('recherche : emprunteur, e-mail, article, taille et laveur ; insensible à la casse', async () => {
        await batch('b1', '2026-09-01T08:00:00.000Z', 'Camille', 'ul-paris-18', 'camille@croix-rouge.fr');
        await loan('l1', 'b1', 'polo-m', { returnedAt: '2026-09-01T09:00:00.000Z', returnedClean: 0, washedAt: '2026-09-01T10:00:00.000Z', washedByName: 'Alex' });
        await batch('b2', '2026-09-02T08:00:00.000Z', 'Sam');
        await loan('l2', 'b2', 'veste-m');

        mockedAuth.mockResolvedValue(ADMIN_18);
        const keys = async (qs: string) => (await (await getHistory(hist(qs))).json()).events.map((e: { key: string }) => e.key);

        expect(await keys('?q=POLO')).toEqual(['wash:l1', 'return:b1:2026-09-01T09:00:00.000Z:l1', 'loan:b1']);
        expect(await keys('?q=sam')).toEqual(['loan:b2']);
        expect(await keys('?q=croix-rouge')).toEqual(['wash:l1', 'return:b1:2026-09-01T09:00:00.000Z:l1', 'loan:b1']);
        expect(await keys('?q=veste')).toEqual(['loan:b2']);
        // Le laveur ne correspond qu'aux événements de lavage.
        expect(await keys('?q=alex')).toEqual(['wash:l1']);
        expect(await keys('?q=polo&type=return')).toEqual(['return:b1:2026-09-01T09:00:00.000Z:l1']);
        expect(await keys('?q=introuvable')).toEqual([]);
    });

    it('recherche : `%` et `_` sont des caractères littéraux', async () => {
        await batch('b1', '2026-09-01T08:00:00.000Z', 'Camille');
        await loan('l1', 'b1', 'polo-m');

        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await (await getHistory(hist('?q=%25'))).json()).events).toEqual([]);
        expect((await (await getHistory(hist('?q=_'))).json()).events).toEqual([]);
    });

    it('pagination keyset : 120 événements → 50, 50, 20, sans doublon ni trou', async () => {
        for (let i = 0; i < 120; i++) {
            const id = `bb${String(i).padStart(3, '0')}`;
            await batch(id, new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString(), `Emprunteur ${i}`);
            await loan(`ll${String(i).padStart(3, '0')}`, id, 'polo-m');
        }

        mockedAuth.mockResolvedValue(ADMIN_18);
        const p1 = await (await getHistory(hist())).json();
        expect(p1.events).toHaveLength(50);
        expect(p1.hasMore).toBe(true);
        expect(typeof p1.nextCursor).toBe('string');
        expect(p1.events[0].borrowerName).toBe('Emprunteur 119');

        const p2 = await (await getHistory(hist(`?cursor=${p1.nextCursor}`))).json();
        expect(p2.events).toHaveLength(50);
        expect(p2.hasMore).toBe(true);

        const p3 = await (await getHistory(hist(`?cursor=${p2.nextCursor}`))).json();
        expect(p3.events).toHaveLength(20);
        expect(p3.hasMore).toBe(false);
        expect(p3.nextCursor).toBeNull();

        const keys = [...p1.events, ...p2.events, ...p3.events].map((e: { key: string }) => e.key);
        expect(new Set(keys).size).toBe(120);
        expect(keys[119]).toBe('loan:bb000');
    });

    it('pagination : à instant égal, l\'ordre est stable sur la clé d\'événement', async () => {
        const at = '2026-09-01T08:00:00.000Z';
        for (const id of ['ba', 'bb', 'bc']) {
            await batch(id, at, id);
            await loan(`l-${id}`, id, 'polo-m');
        }
        const first = await listUlHistory('ul-paris-18', { limit: 2 });
        expect(first.events.map(e => e.key)).toEqual(['loan:bc', 'loan:bb']);
        const second = await listUlHistory('ul-paris-18', { limit: 2, cursor: first.nextCursor });
        expect(second.events.map(e => e.key)).toEqual(['loan:ba']);
        expect(second.hasMore).toBe(false);
    });

    it('rendus de même lot et même instant mais d\'état différent : deux événements, clés distinctes, aucune perte en pagination', async () => {
        const at = '2026-09-01T09:00:00.000Z';
        await batch('b1', '2026-09-01T08:00:00.000Z', 'Camille');
        await loan('l1', 'b1', 'polo-m', { returnedAt: at, returnedClean: 1 });
        await loan('l2', 'b1', 'polo-l', { returnedAt: at, returnedClean: 0, returnComment: 'Boue' });

        const all = await listUlHistory('ul-paris-18', { type: 'return' });
        expect(all.events.map(e => e.key)).toEqual([`return:b1:${at}:l2`, `return:b1:${at}:l1`]);

        const first = await listUlHistory('ul-paris-18', { type: 'return', limit: 1 });
        const second = await listUlHistory('ul-paris-18', { type: 'return', limit: 1, cursor: first.nextCursor });
        expect([...first.events, ...second.events].map(e => e.key)).toEqual(all.events.map(e => e.key));
    });

    it('le curseur encode {at, key} en base64url', async () => {
        const c = encodeCursor({ at: '2026-09-01T08:00:00.000Z', key: 'loan:b1' });
        expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({ at: '2026-09-01T08:00:00.000Z', key: 'loan:b1' });
    });
});

describe('RESP_UNIFORME — droits de gestion', () => {
    beforeEach(async () => {
        await seedUniformItem({ id: 'pull', name: 'Pull' });
    });

    it('RESP_UNIFORME de l\'UL gère le catalogue (articles, tailles)', async () => {
        mockedAuth.mockResolvedValue(RESP_18);
        expect((await postItem(json('POST', { name: 'Casquette' }))).status).toBe(201);
        expect((await patchItem(json('PATCH', { name: 'Pull bleu' }), withId('pull'))).status).toBe(200);
        expect((await postSize(json('POST', { label: 'XL', quantity: 2 }), withId('pull'))).status).toBe(201);
        await seedUniformSize({ id: 'pull-m', itemId: 'pull', label: 'M', quantity: 1 });
        expect((await patchSize(json('PATCH', { quantity: 5 }), withSize('pull', 'pull-m'))).status).toBe(200);
    });

    it('RESP_UNIFORME de l\'UL archive un article et une taille (sans prêt en cours)', async () => {
        await seedUniformSize({ id: 'pull-m', itemId: 'pull', label: 'M', quantity: 1 });
        await seedUniformItem({ id: 'echarpe', name: 'Echarpe' });
        await seedUniformSize({ id: 'echarpe-m', itemId: 'echarpe', label: 'M', quantity: 1 });

        mockedAuth.mockResolvedValue(RESP_18);
        expect((await deleteSize(json('DELETE'), withSize('pull', 'pull-m'))).status).toBe(200);
        expect((await deleteItem(json('DELETE'), withId('echarpe'))).status).toBe(200);
        const archived = await db.execute(`SELECT id FROM "UniformItem" WHERE id = 'echarpe' AND archivedAt IS NOT NULL`);
        expect(archived.rows).toHaveLength(1);
    });

    it('RESP_UNIFORME d\'une autre UL : 403 sur l\'archivage', async () => {
        await seedUniformSize({ id: 'pull-m', itemId: 'pull', label: 'M', quantity: 1 });
        mockedAuth.mockResolvedValue(RESP_4);
        expect((await deleteSize(json('DELETE'), withSize('pull', 'pull-m'))).status).toBe(403);
        expect((await deleteItem(json('DELETE'), withId('pull'))).status).toBe(403);
    });

    it('RESP_UNIFORME d\'une autre UL : 403 sur un article de l\'UL 18', async () => {
        mockedAuth.mockResolvedValue(RESP_4);
        expect((await patchItem(json('PATCH', { name: 'X' }), withId('pull'))).status).toBe(403);
        expect((await postSize(json('POST', { label: 'XL', quantity: 2 }), withId('pull'))).status).toBe(403);
    });

    it('CADRE et PRESIDENT : toujours 403 sur la gestion du catalogue', async () => {
        for (const s of [CADRE_18, PRESIDENT_18]) {
            mockedAuth.mockResolvedValue(s);
            expect((await postItem(json('POST', { name: 'Casquette' }))).status).toBe(403);
            expect((await patchItem(json('PATCH', { name: 'X' }), withId('pull'))).status).toBe(403);
        }
    });

    it('RESP_UNIFORME + INACTIF : tout est refusé', async () => {
        mockedAuth.mockResolvedValue(session(['RESP_UNIFORME', 'INACTIF'], 'u-resp'));
        expect((await postItem(json('POST', { name: 'Casquette' }))).status).toBe(403);
        expect((await getToken()).status).toBe(403);
    });

    it('hors uniformes : aucun droit d\'administration (utilisateurs, véhicules, inventaire)', async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        mockedAuth.mockResolvedValue(RESP_18);
        expect((await getUsers(new Request('http://localhost/api/users'))).status).toBe(403);
        const patch = new Request('http://localhost/api/vehicles/VL001', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X' }),
        });
        expect((await patchVehicle(patch, { params: Promise.resolve({ id: 'VL001' }) })).status).toBe(403);
        const adjust = new Request('http://localhost/api/inventory/adjust', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
        });
        expect((await adjustStock(adjust)).status).toBe(403);
    });

    it('QR : RESP_UNIFORME régénère le token (nouveau token, ancien invalidé)', async () => {
        mockedAuth.mockResolvedValue(RESP_18);
        const before = (await (await getToken()).json()).token;
        const res = await deleteToken();
        expect(res.status).toBe(200);
        const after = (await res.json()).token;
        expect(after).toBeTruthy();
        expect(after).not.toBe(before);
        const stored = await db.execute(`SELECT uniformQrToken FROM "UniteLocale" WHERE id = 'ul-paris-18'`);
        expect(stored.rows[0].uniformQrToken).toBe(after);

        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await deleteToken()).status).toBe(403);
    });

    it('QR : RESP_UNIFORME et CADRE autorisés, CHVL refusé', async () => {
        mockedAuth.mockResolvedValue(RESP_18);
        expect((await getToken()).status).toBe(200);
        mockedAuth.mockResolvedValue(CADRE_18);
        expect((await getToken()).status).toBe(200);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await getToken()).status).toBe(403);
    });
});
