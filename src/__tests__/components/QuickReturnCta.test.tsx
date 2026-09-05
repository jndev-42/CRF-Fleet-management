import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import QuickReturnCta from '@/app/vehicles/QuickReturnCta';
import type { DashboardVehicle } from '@/app/vehicles/types';

function makeVehicle(overrides: Partial<DashboardVehicle> = {}): DashboardVehicle {
    return {
        id: 'uuid-1',
        name: 'VL 186',
        type: 'VL',
        plate: 'AB-123-CD',
        status: 'IN_USE',
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

function renderCta(overrides: Partial<React.ComponentProps<typeof QuickReturnCta>> = {}) {
    const onOpen = vi.fn();
    render(
        <QuickReturnCta
            vehicles={[makeVehicle()]}
            pending={false}
            onOpen={onOpen}
            {...overrides}
        />,
    );
    return { onOpen, button: screen.getByRole('button') as HTMLButtonElement };
}

describe('QuickReturnCta', () => {
    it('un seul véhicule : le libellé le nomme, aria-label explicite', () => {
        const { button } = renderCta({ vehicles: [makeVehicle({ name: 'VL 186' })] });

        expect(button.textContent).toBe('↩️ Rendre VL 186');
        expect(button.getAttribute('aria-label')).toBe('Rendre le véhicule VL 186');
        expect(button.disabled).toBe(false);
    });

    it('plusieurs véhicules : le libellé annonce le compte, pas de nom', () => {
        const { button } = renderCta({
            vehicles: [
                makeVehicle({ id: 'uuid-1', name: 'VL 186' }),
                makeVehicle({ id: 'uuid-2', name: 'VL 204' }),
                makeVehicle({ id: 'uuid-3', name: 'VPSP 12' }),
            ],
        });

        expect(button.textContent).toBe('↩️ Rendre un véhicule (3)');
        expect(button.getAttribute('aria-label')).toBe("Rendre un véhicule (3 en cours d'emprunt)");
        expect(button.textContent).not.toContain('VL 186');
    });

    it('appelle onOpen au clic', async () => {
        const user = userEvent.setup();
        const { onOpen, button } = renderCta();

        await user.click(button);

        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('pending : bouton inerte, libellé inchangé, onOpen non appelé', async () => {
        const user = userEvent.setup();
        const { onOpen, button } = renderCta({ pending: true });

        expect(button.disabled).toBe(true);
        expect(button.textContent).toBe('↩️ Rendre VL 186');

        await user.click(button);
        expect(onOpen).not.toHaveBeenCalled();
    });
});
