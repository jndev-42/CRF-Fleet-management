import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VehicleConnectionBlock from '@/components/vehicle/VehicleConnectionBlock';
import type { Vehicle } from '@/app/vehicles/[id]/types';

const baseVehicle: Vehicle = {
    id: 'uuid-1', name: 'VL186', type: 'VL', plate: 'HJ-269-FE', status: 'AVAILABLE',
    parkingSpot: null, fuelLevel: 60, mileage: 12000, hasDSA: false, desinfTracking: false,
    notes: '', vin: null, connection: null, fuelType: 'Essence', transmission: null,
    maxFuelCapacity: 50, maxBatteryCapacityKwh: null, lastDesinfDate: null, nextDesinfMaxDate: null,
    firstRegistrationDate: '2022-01-15', revisionKmInterval: 15000, revisionYearInterval: 1,
    ulId: 'ul-1', trips: [],
};

function renderBlock(overrides: Partial<React.ComponentProps<typeof VehicleConnectionBlock>> = {}) {
    const props = {
        vehicle: baseVehicle,
        renaultData: null,
        loadingRenault: false,
        userRoles: ['ADMIN'],
        currentUserUlId: 'ul-1',
        onConnect: vi.fn(),
        onDisconnect: vi.fn(),
        ...overrides,
    };
    return { ...render(<VehicleConnectionBlock {...props} />), props };
}

describe('VehicleConnectionBlock', () => {
    it('non connecté + gestionnaire : bouton « Connecter le véhicule »', () => {
        const { props } = renderBlock();
        fireEvent.click(screen.getByRole('button', { name: /Connecter le véhicule/ }));
        expect(props.onConnect).toHaveBeenCalledWith('connect');
    });

    it('non connecté + non gestionnaire : rien affiché', () => {
        const { container } = renderBlock({ userRoles: ['CHVL'] });
        expect(container.textContent).toBe('');
    });

    it('ADMIN d\'une autre UL : pas de bouton (canManage jamais dérivé de connection)', () => {
        const { container } = renderBlock({ currentUserUlId: 'ul-2' });
        expect(container.textContent).toBe('');
    });

    it('SUPER_ADMIN d\'une autre UL : bouton affiché', () => {
        renderBlock({ userRoles: ['SUPER_ADMIN'], currentUserUlId: 'ul-2' });
        expect(screen.getByRole('button', { name: /Connecter le véhicule/ })).toBeTruthy();
    });

    it('état ERROR : bandeau role="alert" avec lastError et bouton « Reconnecter »', () => {
        const { props } = renderBlock({
            vehicle: { ...baseVehicle, connection: { status: 'ERROR', lastError: 'Compte MyRenault verrouillé' } },
        });
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('Compte MyRenault verrouillé');
        fireEvent.click(screen.getByRole('button', { name: /Reconnecter/ }));
        expect(props.onConnect).toHaveBeenCalledWith('edit');
    });

    it('état ERROR + non gestionnaire : bandeau sans bouton', () => {
        renderBlock({
            userRoles: ['CHVL'],
            vehicle: { ...baseVehicle, connection: { status: 'ERROR', lastError: 'Compte MyRenault verrouillé' } },
        });
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Reconnecter/ })).toBeNull();
    });

    it('état CONNECTED : télémétrie + « Modifier » et « Déconnecter »', () => {
        const { props } = renderBlock({
            vehicle: { ...baseVehicle, connection: { status: 'CONNECTED' } },
            loadingRenault: true,
        });
        expect(screen.getByText('Renault Connect')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Modifier/ }));
        expect(props.onConnect).toHaveBeenCalledWith('edit');
        fireEvent.click(screen.getByRole('button', { name: /Déconnecter/ }));
        expect(props.onDisconnect).toHaveBeenCalled();
    });

    it('état CONNECTED + non gestionnaire : aucune action de gestion', () => {
        renderBlock({
            userRoles: ['CHVL'],
            vehicle: { ...baseVehicle, connection: { status: 'CONNECTED' } },
            loadingRenault: true,
        });
        expect(screen.queryByRole('button', { name: /Déconnecter/ })).toBeNull();
    });
});
