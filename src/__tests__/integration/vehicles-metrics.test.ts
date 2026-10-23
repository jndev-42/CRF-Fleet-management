/**
 * Tests d'intégration — PATCH /api/vehicles/[id]/metrics.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/push', () => ({ sendPushNotification: vi.fn().mockResolvedValue(undefined) }));

import { PATCH } from '@/app/api/vehicles/[id]/metrics/route';
import { sendPushNotification } from '@/lib/push';
import { auth } from '@/auth';
import { seedVehicle, seedBrandCredential, seedVehicleConnection } from './setup';

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

    it('retourne 403 pour un véhicule ayant une connexion constructeur', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: 'VF1AB123456789012' });
        await seedBrandCredential({ id: 'cred-1' });
        await seedVehicleConnection({ id: 'vc-1', vehicleId: 'VL001', credentialId: 'cred-1', vin: 'VF1AB123456789012' });

        const res = await PATCH(makeRequest({ mileage: 1000 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(403);
    });

    it('retourne 403 même quand la connexion est en ERROR (une connexion en erreur reste une connexion)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: 'VF1AB123456789012' });
        await seedBrandCredential({ id: 'cred-1' });
        await seedVehicleConnection({ id: 'vc-1', vehicleId: 'VL001', credentialId: 'cred-1', vin: 'VF1AB123456789012', status: 'ERROR' });

        const res = await PATCH(makeRequest({ mileage: 1000 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(403);
    });

    it('retourne 200 pour un véhicule à VIN SANS connexion — le kilométrage reste éditable (P4)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        // VIN hérité de l'ancien système, aucune VehicleConnection : sans ce cas,
        // le kilométrage de ce véhicule n'aurait plus AUCUN chemin de mise à jour.
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: 'VF1AB123456789012', mileage: 500 });

        const res = await PATCH(makeRequest({ mileage: 1500 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.mileage).toBe(1500);
    });

    it('met à jour le kilométrage (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: null, mileage: 500 });

        const res = await PATCH(makeRequest({ mileage: 1500 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.mileage).toBe(1500);
    });

    it('retourne 403 pour un CADRE seul : il ne gère plus les véhicules', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'cadre@test.com', roles: ['CADRE'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: null, mileage: 500 });
        const res = await PATCH(makeRequest({ mileage: 1500 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(403);
    });

    it('retourne 403 pour un RESP_VEHICULE inactif', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'rv@test.com', roles: ['RESP_VEHICULE', 'INACTIF'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: null, mileage: 500 });
        const res = await PATCH(makeRequest({ mileage: 1500 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(403);
    });

    it.each([['PRESIDENT'], ['RESP_VEHICULE']])('met à jour le kilométrage pour un %s', async (role) => {
        mockedAuth.mockResolvedValue({ user: { email: 'mgr@test.com', roles: [role] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: null, mileage: 500 });
        const res = await PATCH(makeRequest({ mileage: 1500 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(200);
        expect((await res.json()).mileage).toBe(1500);
    });

    it('notifie les ADMIN avec un lien relatif encodé, sans notifier l\'auteur', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL 186', vin: null, mileage: 500 });

        const res = await PATCH(makeRequest({ mileage: 1500 }), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(200);

        expect(sendPushNotification).toHaveBeenCalledWith(expect.objectContaining({
            roles: ['ADMIN', 'RESP_VEHICULE'],
            url: '/vehicles/VL%20186',
            excludeUserId: 'admin-1',
        }));
    });
});
