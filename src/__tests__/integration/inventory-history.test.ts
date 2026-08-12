/**
 * Tests d'intégration — GET /api/inventory/history.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/inventory/history/route';
import { auth } from '@/auth';
import { db, seedInvItem } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

function makeRequest(itemId?: string): Request {
    const url = itemId ? `http://localhost/api/inventory/history?itemId=${itemId}` : 'http://localhost/api/inventory/history';
    return new Request(url);
}

describe('GET /api/inventory/history', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(makeRequest('inv-item-1'));
        expect(res.status).toBe(401);
    });

    it('retourne 400 sans itemId', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await GET(makeRequest());
        expect(res.status).toBe(400);
    });

    it('retourne 404 pour un article hors UL', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-lyon-3' } } as never);
        await seedInvItem({ id: 'inv-item-1', ulId: 'ul-paris-18' });
        const res = await GET(makeRequest('inv-item-1'));
        expect(res.status).toBe(404);
    });

    it('retourne l\'historique des mouvements (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        await seedInvItem({ id: 'inv-item-1', ulId: 'ul-paris-18' });
        await db.execute({
            sql: `INSERT INTO "InvStockLog" (id, itemId, "change", userName, note) VALUES (?,?,?,?,?)`,
            args: ['log-1', 'inv-item-1', 5, 'Test User', 'Ajout initial'],
        });

        const res = await GET(makeRequest('inv-item-1'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.logs).toHaveLength(1);
    });
});
