/**
 * Tests d'intégration — PATCH /api/trips/[id]/second-driver.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { PATCH } from '@/app/api/trips/[id]/second-driver/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser, seedTrip } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

function makeRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/trips/trip-1/second-driver', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('PATCH /api/trips/[id]/second-driver', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await PATCH(makeRequest({ secondDriverId: 'user-2' }), { params: Promise.resolve({ id: 'trip-1' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 400 pour un corps invalide (Zod)', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'driver@test.com', roles: ['CHVL'] } } as never);
        const res = await PATCH(makeRequest({ secondDriverId: '' }), { params: Promise.resolve({ id: 'trip-1' }) });
        expect(res.status).toBe(400);
    });

    it('retourne 404 pour un trajet inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'driver@test.com', roles: ['CHVL'] } } as never);
        const res = await PATCH(makeRequest({ secondDriverId: 'user-2' }), { params: Promise.resolve({ id: 'unknown' }) });
        expect(res.status).toBe(404);
    });

    it('retourne 403 pour un autre utilisateur non-admin non-conducteur principal', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-3', email: 'autre@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedUser({ id: 'user-2', email: 'second@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });

        const res = await PATCH(makeRequest({ secondDriverId: 'user-2' }), { params: Promise.resolve({ id: 'trip-1' }) });
        expect(res.status).toBe(403);
    });

    it('retourne 404 pour un 2ème conducteur inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'driver@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });

        const res = await PATCH(makeRequest({ secondDriverId: 'unknown-user' }), { params: Promise.resolve({ id: 'trip-1' }) });
        expect(res.status).toBe(404);
    });

    it('met à jour le 2ème conducteur par le conducteur principal (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'driver@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedUser({ id: 'user-2', email: 'second@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });

        const res = await PATCH(makeRequest({ secondDriverId: 'user-2' }), { params: Promise.resolve({ id: 'trip-1' }) });
        expect(res.status).toBe(200);

        const updated = await db.execute({ sql: `SELECT secondDriverId FROM Trip WHERE id = ?`, args: ['trip-1'] });
        expect(updated.rows[0].secondDriverId).toBe('user-2');
    });
});
