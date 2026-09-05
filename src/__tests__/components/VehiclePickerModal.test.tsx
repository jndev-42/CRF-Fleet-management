import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import VehiclePickerModal from '@/components/vehicle/modals/VehiclePickerModal';
import type { DashboardVehicle } from '@/app/vehicles/types';

function makeVehicle(overrides: Partial<DashboardVehicle> = {}): DashboardVehicle {
    return {
        id: 'uuid-1',
        name: 'VL186',
        type: 'VL',
        plate: 'AB-123-CD',
        status: 'AVAILABLE',
        parkingSpot: 'Baigneur',
        fuelLevel: 80,
        mileage: 10000,
        hasDSA: false,
        notes: null,
        vin: null,
        fuelType: 'Essence',
        transmission: 'Manuelle',
        trips: [],
        ...overrides,
    };
}

const THREE = [
    makeVehicle({ id: 'uuid-1', name: 'VL186', plate: 'AB-123-CD' }),
    makeVehicle({ id: 'uuid-2', name: 'VL204', plate: 'EF-456-GH' }),
    makeVehicle({ id: 'uuid-3', name: 'VPSP12', plate: 'IJ-789-KL', type: 'VPSP' }),
];

function renderPicker(overrides: Partial<React.ComponentProps<typeof VehiclePickerModal>> = {}) {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const utils = render(
        <VehiclePickerModal
            eligibleVehicles={THREE}
            pendingVehicleId={null}
            onSelect={onSelect}
            onClose={onClose}
            {...overrides}
        />,
    );
    return { ...utils, onSelect, onClose };
}

describe('VehiclePickerModal', () => {
    it('rend une ligne cliquable par véhicule, avec nom et plaque', () => {
        renderPicker();

        const rows = screen.getAllByTestId('picker-row') as HTMLButtonElement[];
        expect(rows).toHaveLength(3);
        expect(rows.every(r => r.disabled === false)).toBe(true);

        expect(screen.getByText('VL186')).toBeTruthy();
        expect(screen.getByText('AB-123-CD')).toBeTruthy();
        expect(screen.getByText('VPSP12')).toBeTruthy();
        expect(screen.getByText('IJ-789-KL')).toBeTruthy();
    });

    it('appelle onSelect avec { id, name } exacts au clic sur une ligne', async () => {
        const user = userEvent.setup();
        const { onSelect } = renderPicker();

        await user.click(screen.getAllByTestId('picker-row')[1]);

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith({ id: 'uuid-2', name: 'VL204' });
    });

    it('pendingVehicleId : spinner sur cette ligne seulement, toutes les lignes inertes', () => {
        const { onSelect } = renderPicker({ pendingVehicleId: 'uuid-2' });

        const rows = screen.getAllByTestId('picker-row') as HTMLButtonElement[];
        expect(rows.every(r => r.disabled === true)).toBe(true);

        const spinners = screen.getAllByRole('status');
        expect(spinners).toHaveLength(1);
        expect(rows[1].contains(spinners[0])).toBe(true);

        fireEvent.click(rows[0]);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('ferme sur Échap', () => {
        const { onClose } = renderPicker();

        fireEvent.keyDown(window, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ferme au clic sur l\'overlay, mais pas au clic dans le modal', () => {
        const { container, onClose } = renderPicker();

        fireEvent.click(screen.getByRole('dialog'));
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.click(container.querySelector('.modal-overlay') as HTMLElement);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('liste vide : rendu défensif sans crash', () => {
        renderPicker({ eligibleVehicles: [] });

        expect(screen.queryAllByTestId('picker-row')).toHaveLength(0);
        expect(screen.getByText('Aucun véhicule empruntable pour le moment.')).toBeTruthy();
    });
});
