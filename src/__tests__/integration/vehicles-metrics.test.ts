/**
 * Tests d'intégration — PATCH /api/vehicles/[id]/metrics.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/onesignal', () => ({ sendPushNotification: vi.fn().mockResolvedValue(undefined) }));

import { PATCH } from '@/app/api/vehicles/[id]/metrics/route';
import { auth } from '@/auth';
import { seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

function makeRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/vehicles/VL001/metrics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('PATCH /api/vehicles/[id]/metrics', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await PATCH(makeRequest({ mileage: 1000 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un rôle insuffisant', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await PATCH(makeRequest({ mileage: 1000 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(403);
    });

    it('retourne 400 pour un corps invalide (Zod)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        const res = await PATCH(makeRequest({ mileage: -5 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(400);
    });

    it('retourne 403 pour un véhicule connecté (VIN)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: 'VF1AB123456789012' });

        const res = await PATCH(makeRequest({ mileage: 1000 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(403);
    });

    it('met à jour le kilométrage (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: null, mileage: 500 });

        const res = await PATCH(makeRequest({ mileage: 1500 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.mileage).toBe(1500);
    });
});
