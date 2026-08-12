/**
 * Tests d'intégration — GET /api/inventory/expiring-soon.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/inventory/expiring-soon/route';
import { auth } from '@/auth';
import { seedInvItem, seedInvBatch } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

describe('GET /api/inventory/expiring-soon', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/inventory/expiring-soon'));
        expect(res.status).toBe(401);
    });

    it('ne retourne que les lots de son UL expirant sous un mois (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const soon = new Date();
        soon.setDate(soon.getDate() + 5);
        const far = new Date();
        far.setMonth(far.getMonth() + 6);

        await seedInvItem({ id: 'item-mine', ulId: 'ul-paris-18', name: 'Compresses' });
        await seedInvBatch({ id: 'batch-soon', itemId: 'item-mine', quantity: 5, expiryDate: soon.toISOString().split('T')[0] });
        await seedInvBatch({ id: 'batch-far', itemId: 'item-mine', quantity: 5, expiryDate: far.toISOString().split('T')[0] });

        await seedInvItem({ id: 'item-other-ul', ulId: 'ul-lyon-3', name: 'Autre UL' });
        await seedInvBatch({ id: 'batch-other-ul', itemId: 'item-other-ul', quantity: 5, expiryDate: soon.toISOString().split('T')[0] });

        const res = await GET(new Request('http://localhost/api/inventory/expiring-soon'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.items).toHaveLength(1);
        expect(body.items[0].batchId).toBe('batch-soon');
    });
});
