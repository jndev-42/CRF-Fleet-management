/**
 * Tests d'intégration — PATCH /api/trips/[id]/refresh-renault.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/renault', () => ({ getRenaultVehicleData: vi.fn() }));

import { PATCH } from '@/app/api/trips/[id]/refresh-renault/route';
import { auth } from '@/auth';
import { getRenaultVehicleData } from '@/lib/renault';
import { db, seedVehicle, seedUser, seedTrip } from './setup';

const mockedAuth = vi.mocked(auth);
const mockedGetRenaultVehicleData = vi.mocked(getRenaultVehicleData);

beforeEach(() => {
    vi.resetAllMocks();
});

function makeRequest(): Request {
    return new Request('http://localhost/api/trips/trip-1/refresh-renault', { method: 'PATCH' });
}

describe('PATCH /api/trips/[id]/refresh-renault', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: 'trip-1' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 404 pour un trajet inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: 'unknown' }) });
        expect(res.status).toBe(404);
    });

    it('retourne 400 si le véhicule n\'est pas connecté (pas de VIN)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: null });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1', checkInAt: new Date().toISOString() });
        await db.execute({ sql: `UPDATE Trip SET renaultDataValidated = 0 WHERE id = ?`, args: ['trip-1'] });

        const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: 'trip-1' }) });
        expect(res.status).toBe(400);
    });

    it('retourne throttled si vérifié il y a moins de 5 minutes', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: 'VF1AB123456789012' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1', checkInAt: new Date().toISOString() });
        await db.execute({
            sql: `UPDATE Trip SET renaultDataValidated = 0, renaultLastCheckedAt = ? WHERE id = ?`,
            args: [new Date().toISOString(), 'trip-1'],
        });

        const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: 'trip-1' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('throttled');
    });

    it('valide et met à jour le trajet avec les données Renault fraîches (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const checkInAt = new Date().toISOString();
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: 'VF1AB123456789012' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1', checkInAt, mileageIn: 1000, fuelIn: 50 });
        await db.execute({ sql: `UPDATE Trip SET renaultDataValidated = 0 WHERE id = ?`, args: ['trip-1'] });

        mockedGetRenaultVehicleData.mockResolvedValue({
            totalMileage: 1050,
            isElectric: false,
            batteryLevel: null,
            fuelQuantity: 25,
            cockpitTimestamp: new Date().toISOString(),
        } as never);

        const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: 'trip-1' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.validated).toBe(true);
        expect(body.mileageIn).toBe(1050);

        const updated = await db.execute({ sql: `SELECT renaultDataValidated FROM Trip WHERE id = ?`, args: ['trip-1'] });
        expect(updated.rows[0].renaultDataValidated).toBe(1);
    });
});
