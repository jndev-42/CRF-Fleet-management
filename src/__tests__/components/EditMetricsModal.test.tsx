import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EditMetricsModal from '@/components/vehicle/modals/EditMetricsModal';
import type { Vehicle } from '@/app/vehicles/[id]/types';

const mockVehicle: Vehicle = {
    id: 'VL001', name: 'VL186', type: 'VL', plate: 'HJ-269-FE', status: 'AVAILABLE',
    parkingSpot: 'Place A-1', fuelLevel: 60, mileage: 12000, hasDSA: false, desinfTracking: false,
    notes: '', vin: null, fuelType: 'Essence', maxFuelCapacity: 50, maxBatteryCapacityKwh: null,
    lastDesinfDate: null, nextDesinfMaxDate: null, firstRegistrationDate: '2022-01-15',
    revisionKmInterval: 15000, revisionYearInterval: 1, trips: [],
};

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('EditMetricsModal', () => {
    it('pré-remplit le kilométrage et le niveau de carburant', () => {
        render(<EditMetricsModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('12000');
        expect(screen.getByText(/Niveau de carburant : 60%/)).toBeTruthy();
    });

    it('affiche "batterie" pour un véhicule électrique', () => {
        render(<EditMetricsModal vehicle={{ ...mockVehicle, fuelType: 'Électrique' }} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect(screen.getByText(/Niveau de batterie/)).toBeTruthy();
    });

    it('met à jour les métriques et appelle onSuccess (happy path)', async () => {
        const updatedVehicle = { ...mockVehicle, mileage: 12500 };
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(updatedVehicle), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        const onSuccess = vi.fn();

        render(<EditMetricsModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={onSuccess} />);
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '12500' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(updatedVehicle));
        expect(fetchMock).toHaveBeenCalledWith('/api/vehicles/VL001/metrics', expect.objectContaining({ method: 'PATCH' }));
    });

    it('affiche une erreur si la mise à jour échoue', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Véhicule connecté' }), { status: 403 }));
        render(<EditMetricsModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(await screen.findByText('Véhicule connecté')).toBeTruthy();
    });

    it('appelle onClose au clic sur Annuler', () => {
        const onClose = vi.fn();
        render(<EditMetricsModal vehicle={mockVehicle} onClose={onClose} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onClose).toHaveBeenCalled();
    });
});
