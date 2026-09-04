import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VehicleNotes from '@/components/vehicle/VehicleNotes';
import type { Vehicle } from '@/app/vehicles/[id]/types';

const mockVehicle: Vehicle = {
    id: 'VL001', name: 'VL186', type: 'VL', plate: 'HJ-269-FE', status: 'AVAILABLE',
    parkingSpot: 'Place A-1', fuelLevel: 60, mileage: 12000, hasDSA: false, desinfTracking: false,
    notes: 'Note existante', vin: null, fuelType: 'Essence', transmission: null, maxFuelCapacity: 50, maxBatteryCapacityKwh: null,
    lastDesinfDate: null, nextDesinfMaxDate: null, firstRegistrationDate: '2022-01-15',
    revisionKmInterval: 15000, revisionYearInterval: 1, trips: [],
};

describe('VehicleNotes', () => {
    it('affiche les notes existantes', () => {
        render(<VehicleNotes vehicle={mockVehicle} userRoles={['CHVL']} onSaveNotes={vi.fn()} />);
        expect(screen.getByText('Note existante')).toBeTruthy();
    });

    it('affiche un état vide sans note', () => {
        render(<VehicleNotes vehicle={{ ...mockVehicle, notes: '' }} userRoles={['CHVL']} onSaveNotes={vi.fn()} />);
        expect(screen.getByText('Aucune note pour ce véhicule.')).toBeTruthy();
    });

    it('masque le bouton Éditer pour un non-admin', () => {
        render(<VehicleNotes vehicle={mockVehicle} userRoles={['CHVL']} onSaveNotes={vi.fn()} />);
        expect(screen.queryByText('✏️ Éditer')).toBeNull();
    });

    it('affiche le bouton Éditer pour un admin', () => {
        render(<VehicleNotes vehicle={mockVehicle} userRoles={['ADMIN']} onSaveNotes={vi.fn()} />);
        expect(screen.getByText('✏️ Éditer')).toBeTruthy();
    });

    it('édite et sauvegarde une note (happy path)', async () => {
        const onSaveNotes = vi.fn().mockResolvedValue(undefined);
        render(<VehicleNotes vehicle={mockVehicle} userRoles={['ADMIN']} onSaveNotes={onSaveNotes} />);

        fireEvent.click(screen.getByText('✏️ Éditer'));
        const textarea = screen.getByPlaceholderText('Saisissez des informations sur le véhicule...');
        fireEvent.change(textarea, { target: { value: 'Nouvelle note' } });
        fireEvent.click(screen.getByText('Sauvegarder'));

        await waitFor(() => expect(onSaveNotes).toHaveBeenCalledWith('Nouvelle note'));
        expect(screen.queryByPlaceholderText('Saisissez des informations sur le véhicule...')).toBeNull();
    });

    it('annule l\'édition sans sauvegarder', () => {
        const onSaveNotes = vi.fn();
        render(<VehicleNotes vehicle={mockVehicle} userRoles={['ADMIN']} onSaveNotes={onSaveNotes} />);

        fireEvent.click(screen.getByText('✏️ Éditer'));
        fireEvent.click(screen.getByText('Annuler'));

        expect(onSaveNotes).not.toHaveBeenCalled();
        expect(screen.getByText('Note existante')).toBeTruthy();
    });
});
