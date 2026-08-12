/**
 * Tests d'intégration — DELETE /api/vehicles/[id]/trips.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/drive', () => ({ deleteDriveFolder: vi.fn().mockResolvedValue(undefined) }));

import { DELETE } from '@/app/api/vehicles/[id]/trips/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser, seedTrip } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

function makeRequest(): Request {
    return new Request('http://localhost/api/vehicles/VL001/trips', { method: 'DELETE' });
}

describe('DELETE /api/vehicles/[id]/trips', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un rôle insuffisant', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(403);
    });

    it('retourne 404 pour un véhicule inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
        const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: 'unknown' }) });
        expect(res.status).toBe(404);
    });

    it('retourne 403 pour un admin hors UL du véhicule', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-lyon-3' } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });

        const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(403);
    });

    it('supprime tout l\'historique de trajets et repasse le véhicule à AVAILABLE (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18', status: 'IN_USE' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });
        await seedTrip({ id: 'trip-2', vehicleId: 'VL001', driverId: 'user-1' });

        const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(200);

        const trips = await db.execute({ sql: `SELECT id FROM Trip WHERE vehicleId = ?`, args: ['VL001'] });
        expect(trips.rows).toHaveLength(0);

        const vehicle = await db.execute({ sql: `SELECT status FROM Vehicle WHERE id = ?`, args: ['VL001'] });
        expect(vehicle.rows[0].status).toBe('AVAILABLE');
    });
});
