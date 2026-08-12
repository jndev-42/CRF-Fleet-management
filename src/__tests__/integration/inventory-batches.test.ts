/**
 * Tests d'intégration — GET/DELETE/PATCH /api/inventory/batches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET, DELETE, PATCH } from '@/app/api/inventory/batches/route';
import { auth } from '@/auth';
import { db, seedInvItem, seedInvBatch } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

function makeGetRequest(itemId?: string): Request {
    const url = itemId ? `http://localhost/api/inventory/batches?itemId=${itemId}` : 'http://localhost/api/inventory/batches';
    return new Request(url);
}

function makeDeleteRequest(batchId?: string): Request {
    const url = batchId ? `http://localhost/api/inventory/batches?batchId=${batchId}` : 'http://localhost/api/inventory/batches';
    return new Request(url, { method: 'DELETE' });
}

function makePatchRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/inventory/batches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('GET /api/inventory/batches', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(makeGetRequest('inv-item-1'));
        expect(res.status).toBe(401);
    });

    it('retourne 400 sans itemId', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await GET(makeGetRequest());
        expect(res.status).toBe(400);
    });

    it('retourne 404 pour un article hors UL', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-lyon-3' } } as never);
        await seedInvItem({ id: 'inv-item-1', ulId: 'ul-paris-18' });
        const res = await GET(makeGetRequest('inv-item-1'));
        expect(res.status).toBe(404);
    });

    it('retourne les lots (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        await seedInvItem({ id: 'inv-item-1', ulId: 'ul-paris-18' });
        await seedInvBatch({ id: 'batch-1', itemId: 'inv-item-1', quantity: 5 });

        const res = await GET(makeGetRequest('inv-item-1'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.batches).toHaveLength(1);
    });
});

describe('DELETE /api/inventory/batches', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await DELETE(makeDeleteRequest('batch-1'));
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un rôle insuffisant', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await DELETE(makeDeleteRequest('batch-1'));
        expect(res.status).toBe(403);
    });

    it('retourne 400 sans batchId', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
        const res = await DELETE(makeDeleteRequest());
        expect(res.status).toBe(400);
    });

    it('supprime le lot et resynchronise la quantité (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
        await seedInvItem({ id: 'inv-item-1', ulId: 'ul-paris-18', quantity: 10 });
        await seedInvBatch({ id: 'batch-1', itemId: 'inv-item-1', quantity: 10 });

        const res = await DELETE(makeDeleteRequest('batch-1'));
        expect(res.status).toBe(200);

        const remaining = await db.execute({ sql: `SELECT quantity FROM "InvBatch" WHERE id = ?`, args: ['batch-1'] });
        expect(remaining.rows).toHaveLength(0);
    });
});

describe('PATCH /api/inventory/batches', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await PATCH(makePatchRequest({ batchId: 'batch-1', change: 1 }));
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un rôle insuffisant', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await PATCH(makePatchRequest({ batchId: 'batch-1', change: 1 }));
        expect(res.status).toBe(403);
    });

    it('retourne 400 pour un corps invalide (Zod)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
        const res = await PATCH(makePatchRequest({ batchId: '' }));
        expect(res.status).toBe(400);
    });

    it('ajuste la quantité du lot (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
        await seedInvItem({ id: 'inv-item-1', ulId: 'ul-paris-18', quantity: 5 });
        await seedInvBatch({ id: 'batch-1', itemId: 'inv-item-1', quantity: 5 });

        const res = await PATCH(makePatchRequest({ batchId: 'batch-1', change: 3 }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.newBatchQuantity).toBe(8);
    });

    it('refuse une quantité négative', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
        await seedInvItem({ id: 'inv-item-1', ulId: 'ul-paris-18', quantity: 2 });
        await seedInvBatch({ id: 'batch-1', itemId: 'inv-item-1', quantity: 2 });

        const res = await PATCH(makePatchRequest({ batchId: 'batch-1', change: -5 }));
        expect(res.status).toBe(400);
    });
});
