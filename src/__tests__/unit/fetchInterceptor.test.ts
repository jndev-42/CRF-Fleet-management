import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/demo/DemoDB', () => ({
    DemoDB: {
        getVehicles: vi.fn(),
        getVehicle: vi.fn(),
        updateVehicle: vi.fn(),
        createTrip: vi.fn(),
        checkInTrip: vi.fn(),
        patchTrip: vi.fn(),
        deleteTrip: vi.fn(),
        deleteVehicleTrips: vi.fn(),
        getMissions: vi.fn(),
        createMission: vi.fn(),
        getMission: vi.fn(),
        deleteMission: vi.fn(),
        getMaintenanceRecords: vi.fn(),
        createMaintenanceRecord: vi.fn(),
        deleteMaintenanceRecord: vi.fn(),
        getUsers: vi.fn(),
    },
}));

import { setupFetchInterceptor } from '@/lib/demo/fetchInterceptor';
import { IS_DEMO_MODE_KEY } from '@/lib/contexts/DemoContext';
import { DemoDB } from '@/lib/demo/DemoDB';

const mockedDemoDB = vi.mocked(DemoDB, true);

describe('setupFetchInterceptor', () => {
    const originalFetch = window.fetch;

    beforeEach(() => {
        localStorage.clear();
        window.fetch = originalFetch;
        vi.clearAllMocks();
    });

    afterEach(() => {
        window.fetch = originalFetch;
    });

    it('laisse passer les requêtes réelles si le mode démo est désactivé', async () => {
        const realFetch = vi.fn().mockResolvedValue(new Response('real'));
        window.fetch = realFetch;
        setupFetchInterceptor();

        await window.fetch('/api/vehicles');
        expect(realFetch).toHaveBeenCalledWith('/api/vehicles', undefined);
        expect(mockedDemoDB.getVehicles).not.toHaveBeenCalled();
    });

    it('laisse passer les routes /api/auth/ même en mode démo', async () => {
        const realFetch = vi.fn().mockResolvedValue(new Response('real-auth'));
        window.fetch = realFetch;
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        setupFetchInterceptor();

        await window.fetch('/api/auth/session');
        expect(realFetch).toHaveBeenCalled();
    });

    it('intercepte /api/vehicles (GET) et retourne les données DemoDB', async () => {
        window.fetch = vi.fn();
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        mockedDemoDB.getVehicles.mockReturnValue([{ id: 'VL001' }] as never);
        setupFetchInterceptor();

        const res = await window.fetch('/api/vehicles');
        const body = await res.json();
        expect(body).toEqual([{ id: 'VL001' }]);
    });

    it('intercepte PATCH /api/vehicles/[id] et appelle DemoDB.updateVehicle', async () => {
        window.fetch = vi.fn();
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        mockedDemoDB.updateVehicle.mockReturnValue({ id: 'VL001', mileage: 5000 } as never);
        setupFetchInterceptor();

        const res = await window.fetch('/api/vehicles/VL001', { method: 'PATCH', body: JSON.stringify({ mileage: 5000 }) });
        expect(mockedDemoDB.updateVehicle).toHaveBeenCalledWith('VL001', { mileage: 5000 });
        const body = await res.json();
        expect(body.mileage).toBe(5000);
    });

    it('retourne 404 pour un véhicule inconnu', async () => {
        window.fetch = vi.fn();
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        mockedDemoDB.getVehicle.mockReturnValue(null);
        setupFetchInterceptor();

        const res = await window.fetch('/api/vehicles/unknown');
        expect(res.status).toBe(404);
    });

    it('intercepte POST /api/trips et crée un trajet via DemoDB', async () => {
        window.fetch = vi.fn();
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        mockedDemoDB.createTrip.mockReturnValue({ id: 'trip-1' } as never);
        setupFetchInterceptor();

        const res = await window.fetch('/api/trips', { method: 'POST', body: JSON.stringify({ vehicleId: 'VL001' }) });
        expect(mockedDemoDB.createTrip).toHaveBeenCalledWith({ vehicleId: 'VL001' });
        const body = await res.json();
        expect(body.id).toBe('trip-1');
    });

    it('mocke un succès générique pour une route de mutation non gérée (anti-fuite de données)', async () => {
        window.fetch = vi.fn();
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        setupFetchInterceptor();

        const res = await window.fetch('/api/some/unhandled/route', { method: 'POST', body: '{}' });
        const body = await res.json();
        expect(body).toEqual({ success: true, message: 'Mocked successful mutation' });
    });

    it('retourne une erreur 500 propre si DemoDB lève une exception', async () => {
        window.fetch = vi.fn();
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        mockedDemoDB.updateVehicle.mockImplementation(() => { throw new Error('Véhicule non trouvé'); });
        setupFetchInterceptor();

        const res = await window.fetch('/api/vehicles/VL001', { method: 'PATCH', body: JSON.stringify({ mileage: 1 }) });
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe('Véhicule non trouvé');
    });
});
