/**
 * Tests d'intégration — GET /api/stats/trips.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/stats/trips/route';
import { auth } from '@/auth';
import { seedVehicle, seedUser, seedTrip } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

function makeRequest(qs: string): Request {
    return new Request(`http://localhost/api/stats/trips?${qs}`);
}

describe('GET /api/stats/trips', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(makeRequest('dateFrom=2026-01-01&dateTo=2026-01-31'));
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un rôle INACTIF', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'inactif@test.com', roles: ['INACTIF'] } } as never);
        const res = await GET(makeRequest('dateFrom=2026-01-01&dateTo=2026-01-31'));
        expect(res.status).toBe(403);
    });

    it('retourne 400 pour des paramètres manquants', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await GET(makeRequest(''));
        expect(res.status).toBe(400);
    });

    it('retourne 400 pour une plage de dates trop large', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await GET(makeRequest('dateFrom=2026-01-01&dateTo=2026-06-01'));
        expect(res.status).toBe(400);
    });

    it('retourne une liste vide sans ulId', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET(makeRequest('dateFrom=2026-01-01&dateTo=2026-01-31'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.trips).toEqual([]);
    });

    it('retourne les trajets de son UL sur la période (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1', checkOutAt: '2026-01-15T10:00:00.000Z' });

        const res = await GET(makeRequest('dateFrom=2026-01-01&dateTo=2026-01-31'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.trips).toHaveLength(1);
    });
});
