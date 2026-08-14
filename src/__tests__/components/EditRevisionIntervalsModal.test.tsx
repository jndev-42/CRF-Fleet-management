import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EditRevisionIntervalsModal from '@/components/vehicle/modals/EditRevisionIntervalsModal';
import type { Vehicle } from '@/app/vehicles/[id]/types';

const mockVehicle: Vehicle = {
    id: 'VL001', name: 'VL186', type: 'VL', plate: 'HJ-269-FE', status: 'AVAILABLE',
    parkingSpot: 'Place A-1', fuelLevel: 60, mileage: 12000, hasDSA: false, desinfTracking: false,
    notes: '', vin: null, fuelType: 'Essence', maxFuelCapacity: 50, maxBatteryCapacityKwh: null,
    lastDesinfDate: null, nextDesinfMaxDate: null, firstRegistrationDate: '2022-01-15',
    revisionKmInterval: 20000, revisionYearInterval: 2, trips: [],
};

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('EditRevisionIntervalsModal', () => {
    it('pré-remplit les intervalles existants', () => {
        render(<EditRevisionIntervalsModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect((screen.getByLabelText('Date de première immatriculation') as HTMLInputElement).value).toBe('2022-01-15');
        expect((screen.getByLabelText('Intervalle de révision (km)') as HTMLInputElement).value).toBe('20000');
        expect((screen.getByLabelText('Intervalle de révision (années)') as HTMLInputElement).value).toBe('2');
    });

    it('met à jour les intervalles et appelle onSuccess (happy path)', async () => {
        const updatedVehicle = { ...mockVehicle, revisionKmInterval: 25000 };
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(updatedVehicle), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        const onSuccess = vi.fn();

        render(<EditRevisionIntervalsModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={onSuccess} />);
        fireEvent.change(screen.getByLabelText('Intervalle de révision (km)'), { target: { value: '25000' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(updatedVehicle));
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.revisionKmInterval).toBe(25000);
        expect(fetchMock).toHaveBeenCalledWith('/api/vehicles/VL186', expect.objectContaining({ method: 'PATCH' }));
    });

    it('n\'envoie pas les champs vidés', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockVehicle), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);

        render(<EditRevisionIntervalsModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('Intervalle de révision (années)'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.revisionYearInterval).toBeUndefined();
    });

    it('affiche une erreur si la mise à jour échoue', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Véhicule non trouvé' }), { status: 404 }));
        render(<EditRevisionIntervalsModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(await screen.findByText('Véhicule non trouvé')).toBeTruthy();
    });
});
