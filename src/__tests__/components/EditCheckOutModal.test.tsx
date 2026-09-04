import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EditCheckOutModal from '@/components/vehicle/modals/EditCheckOutModal';
import type { Vehicle, Trip } from '@/app/vehicles/[id]/types';

const mockVehicle: Vehicle = {
    id: 'VL001', name: 'VL186', type: 'VL', plate: 'HJ-269-FE', status: 'IN_USE',
    parkingSpot: 'Place A-1', fuelLevel: 80, mileage: 12000, hasDSA: false, desinfTracking: false,
    notes: '', vin: null, fuelType: 'Essence', transmission: null, maxFuelCapacity: 50, maxBatteryCapacityKwh: null,
    lastDesinfDate: null, nextDesinfMaxDate: null, firstRegistrationDate: '2022-01-15',
    revisionKmInterval: 15000, revisionYearInterval: 1, trips: [],
};

const mockTrip: Trip = {
    id: 'trip-1', driverId: 'user-1', secondDriverId: null, driverName: 'Jean Dupont', driverEmail: 'jean@test.com',
    secondDriverName: null, secondDriverEmail: null, missionType: 'DPS', missionName: null,
    checkOutAt: '2026-01-15T10:00:00.000Z', checkInAt: null, mileageOut: 12000, mileageIn: null,
    fuelOut: 80, fuelIn: null, parkingOut: 'Place A-1', parkingIn: null, conditionOut: 'Bon état',
    conditionIn: null, cleanlinessOut: 'Propre', cleanlinessIn: null, dsaChecked: false,
    commentsOut: '', commentsIn: null, incident: null, parkingPhoto: null, driveFolderId: null,
    renaultDataValidated: null, renaultLastCheckedAt: null, desinfResponsable: null,
    desinfLotNumber: null, desinfType: null, desinfResponsableId: null,
};

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ users: [{ id: 'user-1', name: 'Jean Dupont', email: 'jean@test.com' }] }), { status: 200 }));
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('EditCheckOutModal', () => {
    it('pré-remplit le formulaire à partir du trajet existant', () => {
        render(<EditCheckOutModal trip={mockTrip} vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect((screen.getByLabelText('Kilométrage au départ (km) *') as HTMLInputElement).value).toBe('12000');
        expect(screen.getByText(/Essence au départ : 80%/)).toBeTruthy();
    });

    it('soumet les modifications et appelle onSuccess (happy path)', async () => {
        const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : String(input);
            if (url.includes('/api/users')) return Promise.resolve(new Response(JSON.stringify({ users: [{ id: 'user-1', name: 'Jean Dupont', email: 'jean@test.com' }] }), { status: 200 }));
            return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
        });
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        const onSuccess = vi.fn();

        render(<EditCheckOutModal trip={mockTrip} vehicle={mockVehicle} onClose={vi.fn()} onSuccess={onSuccess} />);
        fireEvent.change(screen.getByLabelText('Kilométrage au départ (km) *'), { target: { value: '12500' } });
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer les modifications/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const patchCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'PATCH');
        expect(patchCall).toBeTruthy();
        const body = JSON.parse((patchCall![1] as RequestInit).body as string);
        expect(body.mileageOut).toBe(12500);
        expect(String(patchCall![0])).toBe('/api/trips/trip-1/checkout');
    });

    it('affiche une erreur si la modification échoue', async () => {
        const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
            const url = typeof input === 'string' ? input : String(input);
            if (url.includes('/api/users')) return Promise.resolve(new Response(JSON.stringify({ users: [] }), { status: 200 }));
            return Promise.resolve(new Response(JSON.stringify({ error: 'Trajet non trouvé' }), { status: 404 }));
        });
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);

        render(<EditCheckOutModal trip={mockTrip} vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer les modifications/ }));

        expect(await screen.findByText('Trajet non trouvé')).toBeTruthy();
    });

    it('affiche l\'option Désinfection uniquement pour un véhicule VPSP', () => {
        const { rerender } = render(<EditCheckOutModal trip={mockTrip} vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect(screen.queryByText('🧴 Désinfection')).toBeNull();

        rerender(<EditCheckOutModal trip={mockTrip} vehicle={{ ...mockVehicle, type: 'VPSP' }} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect(screen.getByText('🧴 Désinfection')).toBeTruthy();
    });

    it('n\'est pas masquée aux technologies d\'assistance (pas d\'aria-hidden sur l\'overlay)', () => {
        const { container } = render(<EditCheckOutModal trip={mockTrip} vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(container.querySelector('.modal-overlay')?.getAttribute('aria-hidden')).toBeNull();
    });
});
