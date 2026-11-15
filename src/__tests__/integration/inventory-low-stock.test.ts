/**
 * Tests d'intégration — GET et PATCH /api/inventory/low-stock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET, PATCH } from '@/app/api/inventory/low-stock/route';
import { auth } from '@/auth';
import { db, seedInvItem } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

describe('GET /api/inventory/low-stock', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/inventory/low-stock'));
        expect(res.status).toBe(401);
    });

    it('ne retourne que les articles sous le seuil, de son UL (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);

        await seedInvItem({ id: 'item-low', ulId: 'ul-paris-18', name: 'Gants', quantity: 2, minStock: 10 });
        await seedInvItem({ id: 'item-ok', ulId: 'ul-paris-18', name: 'Masques', quantity: 50, minStock: 10 });
        await seedInvItem({ id: 'item-other-ul', ulId: 'ul-lyon-3', name: 'Autre UL', quantity: 1, minStock: 10 });

        const res = await GET(new Request('http://localhost/api/inventory/low-stock'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.items).toHaveLength(1);
        expect(body.items[0].id).toBe('item-low');
    });
});

function patchRequest(body: unknown): Request {
    return new Request('http://localhost/api/inventory/low-stock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('PATCH /api/inventory/low-stock', () => {
    const manager = { user: { id: 'u1', email: 'resp@test.com', roles: ['RESP_INVENTAIRE'], ulId: 'ul-paris-18' } };

    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await PATCH(patchRequest({ itemId: 'x', ordered: true }));
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un non gestionnaire', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'u2', email: 'c@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        await seedInvItem({ id: 'item-low', quantity: 2, minStock: 10 });
        const res = await PATCH(patchRequest({ itemId: 'item-low', ordered: true }));
        expect(res.status).toBe(403);
    });

    it('retourne 400 si le corps est invalide', async () => {
        mockedAuth.mockResolvedValue(manager as never);
        expect((await PATCH(patchRequest({ itemId: 'item-low' }))).status).toBe(400);
        expect((await PATCH(patchRequest({ itemId: 'item-low', ordered: 'oui' }))).status).toBe(400);
        expect((await PATCH(patchRequest({ ordered: true }))).status).toBe(400);
    });

    it('retourne 404 pour un article inconnu ou d\'une autre UL', async () => {
        mockedAuth.mockResolvedValue(manager as never);
        await seedInvItem({ id: 'item-other-ul', ulId: 'ul-lyon-3', quantity: 1, minStock: 10 });
        expect((await PATCH(patchRequest({ itemId: 'item-other-ul', ordered: true }))).status).toBe(404);
        expect((await PATCH(patchRequest({ itemId: 'inconnu', ordered: true }))).status).toBe(404);
        const row = await db.execute({ sql: `SELECT orderedAt FROM "InvItem" WHERE id = ?`, args: ['item-other-ul'] });
        expect(row.rows[0].orderedAt).toBeNull();
    });

    it('marque puis retire « commandé » sans toucher à la quantité (happy path)', async () => {
        mockedAuth.mockResolvedValue(manager as never);
        await seedInvItem({ id: 'item-low', ulId: 'ul-paris-18', quantity: 2, minStock: 10 });

        const marked = await PATCH(patchRequest({ itemId: 'item-low', ordered: true }));
        expect(marked.status).toBe(200);
        expect((await marked.json()).orderedAt).toBeTruthy();

        const got = await (await GET(new Request('http://localhost/api/inventory/low-stock'))).json();
        expect(got.items[0].orderedAt).toBeTruthy();

        const row = await db.execute({ sql: `SELECT quantity FROM "InvItem" WHERE id = ?`, args: ['item-low'] });
        expect(row.rows[0].quantity).toBe(2);
        const logs = await db.execute({ sql: `SELECT COUNT(*) AS c FROM "InvStockLog" WHERE itemId = ?`, args: ['item-low'] });
        expect(logs.rows[0].c).toBe(0);

        const cleared = await PATCH(patchRequest({ itemId: 'item-low', ordered: false }));
        expect(cleared.status).toBe(200);
        expect((await cleared.json()).orderedAt).toBeNull();
        const after = await (await GET(new Request('http://localhost/api/inventory/low-stock'))).json();
        expect(after.items[0].orderedAt).toBeNull();
    });
});
