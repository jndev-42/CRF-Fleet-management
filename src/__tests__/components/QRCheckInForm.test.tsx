import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CheckInForm from '@/app/qr/[token]/CheckInForm';
import type { ActiveTrip, QRVehicle } from '@/app/qr/[token]/types';

vi.mock('@/components/vehicle/ChecklistItems', () => ({
    default: () => null,
}));

const trip: ActiveTrip = {
    id: 't1',
    vehicleId: 'VPSP01',
    driverId: 'usr-1',
    secondDriverId: null,
    driverName: 'Jean Dupont',
    driverEmail: 'jean@croix-rouge.fr',
    secondDriverName: null,
    secondDriverEmail: null,
    missionType: 'Désinfection',
    missionName: null,
    checkOutAt: new Date().toISOString(),
    mileageOut: 12000,
    fuelOut: 40,
    conditionOut: 'Bon état',
};

const vehicle: QRVehicle = {
    id: 'VPSP01',
    name: 'VPSP 01',
    plate: 'AB-123-CD',
    type: 'VPSP',
    status: 'IN_USE',
    fuelLevel: 40,
    mileage: 12000,
    fuelType: 'Diesel',
    hasDSA: true,
    desinfTracking: false,
    parkingSpot: null,
    connection: null,
    maxFuelCapacity: 50,
    activeTrip: trip,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
        if (String(url).includes('/desinf-responsables')) {
            return Promise.resolve(new Response(JSON.stringify({
                users: [{ id: 'usr-2', name: 'Marie Martin', email: 'marie@croix-rouge.fr' }],
            }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('CheckInForm (QR) — responsable de la désinfection', () => {
    it("charge les responsables via la route QR dédiée (et non GET /api/users, réservé aux gestionnaires)", async () => {
        render(<CheckInForm vehicle={vehicle} token="tok-1" onSuccess={vi.fn()} />);

        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/qr/tok-1/desinf-responsables'));
        expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith('/api/users'))).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: /Sélectionner un responsable/ }));
        expect(await screen.findByRole('option', { name: /Marie Martin/ })).toBeTruthy();
    });

    it('ne charge rien pour une mission sans désinfection', async () => {
        render(<CheckInForm vehicle={{ ...vehicle, activeTrip: { ...trip, missionType: 'DPS' } }} token="tok-1" onSuccess={vi.fn()} />);
        await new Promise(r => setTimeout(r, 0));
        expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/desinf-responsables'))).toBe(false);
    });
});
