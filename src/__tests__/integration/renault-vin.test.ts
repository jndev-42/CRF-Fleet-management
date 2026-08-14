/**
 * Tests d'intégration — GET /api/renault/[vin].
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/renault', () => ({ getRenaultVehicleData: vi.fn() }));

import { GET } from '@/app/api/renault/[vin]/route';
import { auth } from '@/auth';
import { getRenaultVehicleData } from '@/lib/renault';
import { seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);
const mockedGetRenaultVehicleData = vi.mocked(getRenaultVehicleData);

beforeEach(() => {
    vi.resetAllMocks();
});

describe('GET /api/renault/[vin]', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/renault/VF1AB123456789012'), { params: Promise.resolve({ vin: 'VF1AB123456789012' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 404 pour un VIN inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
        const res = await GET(new Request('http://localhost/api/renault/unknown'), { params: Promise.resolve({ vin: 'unknown' }) });
        expect(res.status).toBe(404);
    });

    it('retourne 403 pour un utilisateur hors UL du véhicule', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-lyon-3' } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: 'VF1AB123456789012', ulId: 'ul-paris-18' });

        const res = await GET(new Request('http://localhost/api/renault/VF1AB123456789012'), { params: Promise.resolve({ vin: 'VF1AB123456789012' }) });
        expect(res.status).toBe(403);
    });

    it('retourne les données pour un utilisateur de la même UL (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: 'VF1AB123456789012', ulId: 'ul-paris-18' });
        mockedGetRenaultVehicleData.mockResolvedValue({ totalMileage: 1234, batteryLevel: 80 } as never);

        const res = await GET(new Request('http://localhost/api/renault/VF1AB123456789012'), { params: Promise.resolve({ vin: 'VF1AB123456789012' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.totalMileage).toBe(1234);
    });

    it('autorise un SUPER_ADMIN hors UL', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'super@test.com', roles: ['SUPER_ADMIN'], ulId: 'ul-lyon-3' } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: 'VF1AB123456789012', ulId: 'ul-paris-18' });
        mockedGetRenaultVehicleData.mockResolvedValue({ totalMileage: 1234 } as never);

        const res = await GET(new Request('http://localhost/api/renault/VF1AB123456789012'), { params: Promise.resolve({ vin: 'VF1AB123456789012' }) });
        expect(res.status).toBe(200);
    });
});
