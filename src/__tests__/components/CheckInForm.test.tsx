import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CheckInForm from '@/app/qr/[token]/CheckInForm';
import type { QRVehicle } from '@/app/qr/[token]/types';

function vehicle(overrides: Partial<QRVehicle> = {}): QRVehicle {
    return {
        id: 'VL001', name: 'VL 186', plate: 'AA-123-AA', type: 'VL', status: 'IN_USE',
        fuelLevel: 60, mileage: 10000, fuelType: null, hasDSA: false, desinfTracking: true,
        parkingSpot: null, connection: null, maxFuelCapacity: null,
        activeTrip: {
            id: 'trip-1', vehicleId: 'VL001', driverId: 'u1', secondDriverId: null,
            driverName: 'Chauffeur', driverEmail: 'driver@test.com', secondDriverName: null, secondDriverEmail: null,
            missionType: 'LOGISTIQUE', missionName: null, checkOutAt: new Date().toISOString(),
            mileageOut: 10000, fuelOut: 60, conditionOut: 'Bon état',
        },
        ...overrides,
    };
}

afterEach(() => vi.unstubAllGlobals());

describe('CheckInForm — sélecteur du responsable de désinfection', () => {
    it('charge les responsables via la route QR dédiée', async () => {
        const fetchMock = vi.fn().mockImplementation(async (input: string) => new Response(
            JSON.stringify(String(input).includes('/checklist') ? [] : { users: [] }),
            { status: 200 },
        ));
        vi.stubGlobal('fetch', fetchMock);

        render(<CheckInForm vehicle={vehicle()} token="tok" onSuccess={() => {}} />);

        await waitFor(() => {
            const urls = fetchMock.mock.calls.map(([u]) => String(u));
            expect(urls).toContain('/api/qr/tok/desinf-responsables');
            expect(urls).not.toContain('/api/users');
        });
    });
});

describe('CheckInForm — checklist QR', () => {
    it('lit la checklist par la route QR (ouverte entre ULs)', async () => {
        const fetchMock = vi.fn().mockImplementation(async (input: string) => new Response(
            JSON.stringify(String(input).includes('/checklist') ? [] : { users: [] }),
            { status: 200 },
        ));
        vi.stubGlobal('fetch', fetchMock);

        render(<CheckInForm vehicle={vehicle()} token="tok" onSuccess={() => {}} />);

        await waitFor(() => {
            const urls = fetchMock.mock.calls.map(([u]) => String(u));
            expect(urls).toContain('/api/qr/tok/checklist?type=checkin');
            expect(urls.some(u => u.startsWith('/api/vehicles/'))).toBe(false);
        });
    });
});
