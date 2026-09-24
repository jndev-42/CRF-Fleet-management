/**
 * Tests d'intégration — catalogue Uniformes :
 *   GET/POST /api/uniforms/items
 *   PATCH/DELETE /api/uniforms/items/[id]
 *   POST /api/uniforms/items/[id]/sizes
 *   PATCH/DELETE /api/uniforms/items/[id]/sizes/[sizeId]
 *
 * Lecture : tout compte actif, UL active uniquement. Gestion : `isAdminOrAbove`,
 * cloisonnée à l'UL de session. Retrait = archivage, refusé (409) tant que des
 * pièces sont empruntées.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET as getItems, POST as postItem } from '@/app/api/uniforms/items/route';
import { PATCH as patchItem, DELETE as deleteItem } from '@/app/api/uniforms/items/[id]/route';
import { POST as postSize } from '@/app/api/uniforms/items/[id]/sizes/route';
import { PATCH as patchSize, DELETE as deleteSize } from '@/app/api/uniforms/items/[id]/sizes/[sizeId]/route';
import { auth } from '@/auth';
import { db, seedUniteLocale, seedUniformItem, seedUniformSize } from './setup';

const mockedAuth = vi.mocked(auth);

const session = (roles: string[], ulId = 'ul-paris-18', id = 'u-x') =>
    ({ user: { id, email: `${id}@test.com`, name: id, ulId, roles } }) as never;

const ADMIN_18 = session(['ADMIN'], 'ul-paris-18', 'u-admin');
const ADMIN_4 = session(['ADMIN'], 'ul-paris-4', 'u-admin4');
const CHVL_18 = session(['CHVL'], 'ul-paris-18', 'u-chvl');
const CADRE_18 = session(['CADRE'], 'ul-paris-18', 'u-cadre');

function json(method: string, body?: unknown): Request {
    return new Request('http://localhost/api/uniforms/items', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}
const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const withSize = (id: string, sizeId: string) => ({ params: Promise.resolve({ id, sizeId }) });

async function openLoan(sizeId: string, returnedAt: string | null = null) {
    const batchId = crypto.randomUUID();
    await db.execute({
        sql: `INSERT INTO "UniformLoanBatch" (id, ulId, borrowerId) VALUES (?, 'ul-paris-18', 'u-chvl')`,
        args: [batchId],
    });
    await db.execute({
        sql: `INSERT INTO "UniformLoan" (id, batchId, sizeId, borrowerId, returnedAt, returnedClean) VALUES (?, ?, ?, 'u-chvl', ?, ?)`,
        args: [crypto.randomUUID(), batchId, sizeId, returnedAt, returnedAt ? 0 : null],
    });
}

beforeEach(async () => {
    mockedAuth.mockReset();
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-paris-4', name: 'Paris 4', slug: 'paris-4' });
});

describe('GET /api/uniforms/items', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await getItems()).status).toBe(401);
    });

    it('403 pour un compte INACTIF, et pour un compte sans rôle', async () => {
        mockedAuth.mockResolvedValue(session(['INACTIF']));
        expect((await getItems()).status).toBe(403);
        mockedAuth.mockResolvedValue(session([]));
        expect((await getItems()).status).toBe(403);
    });

    it('AC1 — un CHVL voit les tailles et le disponible de son UL, rien d\'une autre UL', async () => {
        await seedUniformItem({ id: 'polo', name: 'Polo' });
        await seedUniformSize({ id: 'polo-m', itemId: 'polo', label: 'M', quantity: 3 });
        await seedUniformSize({ id: 'polo-l', itemId: 'polo', label: 'L', quantity: 2 });
        await seedUniformItem({ id: 'veste-4', ulId: 'ul-paris-4', name: 'Veste' });
        await seedUniformSize({ id: 'veste-4-m', itemId: 'veste-4', label: 'M', quantity: 5 });

        mockedAuth.mockResolvedValue(CHVL_18);
        const res = await getItems();
        expect(res.status).toBe(200);
        const { items } = await res.json();
        expect(items).toHaveLength(1);
        expect(items[0].name).toBe('Polo');
        expect(items[0].sizes).toEqual([
            { id: 'polo-m', label: 'M', quantity: 3, available: 3 },
            { id: 'polo-l', label: 'L', quantity: 2, available: 2 },
        ]);
    });

    it('le disponible déduit les pièces en cours et les pièces sales non lavées', async () => {
        await seedUniformItem({ id: 'polo' });
        await seedUniformSize({ id: 'polo-m', itemId: 'polo', quantity: 3 });
        await openLoan('polo-m');
        await openLoan('polo-m', '2026-09-01T10:00:00.000Z'); // rendue sale

        mockedAuth.mockResolvedValue(CHVL_18);
        const { items } = await (await getItems()).json();
        expect(items[0].sizes[0].available).toBe(1);
    });

    it('n\'affiche ni article ni taille archivés', async () => {
        await seedUniformItem({ id: 'polo' });
        await seedUniformSize({ id: 'polo-m', itemId: 'polo', label: 'M' });
        await seedUniformSize({ id: 'polo-xl', itemId: 'polo', label: 'XL', archivedAt: '2026-09-01' });
        await seedUniformItem({ id: 'old', name: 'Ancien', archivedAt: '2026-09-01' });

        mockedAuth.mockResolvedValue(CHVL_18);
        const { items } = await (await getItems()).json();
        expect(items.map((i: { id: string }) => i.id)).toEqual(['polo']);
        expect(items[0].sizes.map((s: { label: string }) => s.label)).toEqual(['M']);
    });
});

describe('POST /api/uniforms/items', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await postItem(json('POST', { name: 'Polo' }))).status).toBe(401);
    });

    it('403 pour un CHVL et pour un CADRE', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await postItem(json('POST', { name: 'Polo' }))).status).toBe(403);
        mockedAuth.mockResolvedValue(CADRE_18);
        expect((await postItem(json('POST', { name: 'Polo' }))).status).toBe(403);
    });

    it('403 pour un ADMIN portant INACTIF', async () => {
        mockedAuth.mockResolvedValue(session(['ADMIN', 'INACTIF']));
        expect((await postItem(json('POST', { name: 'Polo' }))).status).toBe(403);
    });

    it('400 sur un nom vide ou une quantité négative', async () => {
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await postItem(json('POST', { name: '  ' }))).status).toBe(400);
        expect((await postItem(json('POST', { name: 'Polo', sizes: [{ label: 'M', quantity: -1 }] }))).status).toBe(400);
    });

    it('crée l\'article et ses tailles dans l\'UL de session', async () => {
        mockedAuth.mockResolvedValue(ADMIN_18);
        const res = await postItem(json('POST', { name: 'Polo', sizes: [{ label: 'M', quantity: 3 }, { label: 'L', quantity: 2 }] }));
        expect(res.status).toBe(201);
        const { id } = await res.json();

        const item = await db.execute({ sql: `SELECT ulId, name FROM "UniformItem" WHERE id = ?`, args: [id] });
        expect(item.rows[0]).toMatchObject({ ulId: 'ul-paris-18', name: 'Polo' });
        const sizes = await db.execute({ sql: `SELECT label, quantity FROM "UniformSize" WHERE itemId = ? ORDER BY label`, args: [id] });
        expect(sizes.rows.map(r => [r.label, r.quantity])).toEqual([['L', 2], ['M', 3]]);
    });

    it('409 sur un nom déjà utilisé dans l\'UL (casse ignorée)', async () => {
        await seedUniformItem({ id: 'polo', name: 'Polo' });
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await postItem(json('POST', { name: 'polo' }))).status).toBe(409);
    });

    it('400 sans UL active', async () => {
        mockedAuth.mockResolvedValue(session(['ADMIN'], 'default'));
        expect((await postItem(json('POST', { name: 'Polo' }))).status).toBe(400);
    });
});

describe('PATCH/DELETE /api/uniforms/items/[id]', () => {
    beforeEach(async () => {
        await seedUniformItem({ id: 'polo', name: 'Polo' });
        await seedUniformSize({ id: 'polo-m', itemId: 'polo' });
    });

    it('401 / 403 CHVL', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await patchItem(json('PATCH', { name: 'X' }), withId('polo'))).status).toBe(401);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await patchItem(json('PATCH', { name: 'X' }), withId('polo'))).status).toBe(403);
        expect((await deleteItem(json('DELETE'), withId('polo'))).status).toBe(403);
    });

    it('400 sur un corps invalide', async () => {
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await patchItem(json('PATCH', { name: '' }), withId('polo'))).status).toBe(400);
    });

    it('403 pour un admin d\'une autre UL', async () => {
        mockedAuth.mockResolvedValue(ADMIN_4);
        expect((await patchItem(json('PATCH', { name: 'X' }), withId('polo'))).status).toBe(403);
        expect((await deleteItem(json('DELETE'), withId('polo'))).status).toBe(403);
    });

    it('renomme l\'article', async () => {
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await patchItem(json('PATCH', { name: 'Polo manches longues' }), withId('polo'))).status).toBe(200);
        const res = await db.execute(`SELECT name FROM "UniformItem" WHERE id = 'polo'`);
        expect(res.rows[0].name).toBe('Polo manches longues');
    });

    it('404 sur un article inconnu', async () => {
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await deleteItem(json('DELETE'), withId('inconnu'))).status).toBe(404);
    });

    it('409 à l\'archivage tant qu\'une pièce est empruntée, puis archive une fois rendue', async () => {
        await openLoan('polo-m');
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await deleteItem(json('DELETE'), withId('polo'))).status).toBe(409);

        await db.execute(`UPDATE "UniformLoan" SET returnedAt = '2026-09-02', returnedClean = 1`);
        expect((await deleteItem(json('DELETE'), withId('polo'))).status).toBe(200);
        const res = await db.execute(`SELECT archivedAt FROM "UniformItem" WHERE id = 'polo'`);
        expect(res.rows[0].archivedAt).not.toBeNull();
        // L'historique reste intact.
        expect((await db.execute(`SELECT COUNT(*) AS c FROM "UniformLoan"`)).rows[0].c).toBe(1);
    });
});

describe('POST /api/uniforms/items/[id]/sizes', () => {
    beforeEach(async () => {
        await seedUniformItem({ id: 'polo', name: 'Polo' });
    });

    it('401 / 403 / 400', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await postSize(json('POST', { label: 'M', quantity: 1 }), withId('polo'))).status).toBe(401);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await postSize(json('POST', { label: 'M', quantity: 1 }), withId('polo'))).status).toBe(403);
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await postSize(json('POST', { label: 'M' }), withId('polo'))).status).toBe(400);
    });

    it('ajoute une taille, 409 sur un doublon', async () => {
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await postSize(json('POST', { label: 'M', quantity: 4 }), withId('polo'))).status).toBe(201);
        expect((await postSize(json('POST', { label: 'm', quantity: 1 }), withId('polo'))).status).toBe(409);
    });

    it('403 pour un admin d\'une autre UL', async () => {
        mockedAuth.mockResolvedValue(ADMIN_4);
        expect((await postSize(json('POST', { label: 'M', quantity: 1 }), withId('polo'))).status).toBe(403);
    });
});

describe('PATCH/DELETE /api/uniforms/items/[id]/sizes/[sizeId]', () => {
    beforeEach(async () => {
        await seedUniformItem({ id: 'polo', name: 'Polo' });
        await seedUniformSize({ id: 'polo-m', itemId: 'polo', quantity: 3 });
    });

    it('401 / 403 / 400', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await patchSize(json('PATCH', { quantity: 5 }), withSize('polo', 'polo-m'))).status).toBe(401);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await patchSize(json('PATCH', { quantity: 5 }), withSize('polo', 'polo-m'))).status).toBe(403);
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await patchSize(json('PATCH', {}), withSize('polo', 'polo-m'))).status).toBe(400);
    });

    it('modifie la quantité possédée', async () => {
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await patchSize(json('PATCH', { quantity: 7 }), withSize('polo', 'polo-m'))).status).toBe(200);
        const res = await db.execute(`SELECT quantity FROM "UniformSize" WHERE id = 'polo-m'`);
        expect(res.rows[0].quantity).toBe(7);
    });

    it('404 si la taille n\'appartient pas à l\'article', async () => {
        await seedUniformItem({ id: 'veste', name: 'Veste' });
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await patchSize(json('PATCH', { quantity: 7 }), withSize('veste', 'polo-m'))).status).toBe(404);
    });

    it('archivage d\'une taille empruntée → 409 ; ses emprunts restent', async () => {
        await openLoan('polo-m');
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await deleteSize(json('DELETE'), withSize('polo', 'polo-m'))).status).toBe(409);
        const res = await db.execute(`SELECT archivedAt FROM "UniformSize" WHERE id = 'polo-m'`);
        expect(res.rows[0].archivedAt).toBeNull();
    });

    it('archive une taille sans emprunt en cours (une pièce sale non lavée ne bloque pas)', async () => {
        await openLoan('polo-m', '2026-09-01T10:00:00.000Z');
        mockedAuth.mockResolvedValue(ADMIN_18);
        expect((await deleteSize(json('DELETE'), withSize('polo', 'polo-m'))).status).toBe(200);
        mockedAuth.mockResolvedValue(CHVL_18);
        const { items } = await (await getItems()).json();
        expect(items[0].sizes).toEqual([]);
    });
});
