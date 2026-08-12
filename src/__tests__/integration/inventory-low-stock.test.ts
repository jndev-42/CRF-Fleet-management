/**
 * Tests d'intégration — GET /api/inventory/low-stock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/inventory/low-stock/route';
import { auth } from '@/auth';
import { seedInvItem } from './setup';

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
