/**
 * Tests du bandeau de maintenance de la fiche véhicule.
 *
 * Fichier testé : src/app/vehicles/[id]/MaintenanceBanner.tsx
 *
 * Le bouton « Remettre en service » est doublement gaté : `canEndMaintenance`
 * (prop REQUISE, valant `!activeTrip` côté page) ET le rôle ADMIN. Remettre en
 * service un véhicule physiquement dehors autoriserait un second check-out.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import MaintenanceBanner from '@/app/vehicles/[id]/MaintenanceBanner';
import { formatDate } from '@/app/vehicles/[id]/utils';
import type { Vehicle } from '@/app/vehicles/[id]/types';

const BANNER_TEXT = '🔧 Ce véhicule est actuellement en maintenance';
const END_LABEL = '✅ Remettre en service';

const START_ISO = '2026-07-20T08:30:00.000Z';
const END_ISO = '2026-07-25T17:00:00.000Z';

const baseVehicle: Vehicle = {
    id: 'veh-1',
    name: 'VL186',
    type: 'VL',
    plate: 'HJ-269-FE',
    status: 'MAINTENANCE',
    parkingSpot: 'Place A-1',
    fuelLevel: 80,
    mileage: 12000,
    hasDSA: false,
    desinfTracking: false,
    notes: null,
    vin: null,
    connection: null,
    fuelType: 'Essence',
    transmission: null,
    maxFuelCapacity: 50,
    maxBatteryCapacityKwh: null,
    lastDesinfDate: null,
    nextDesinfMaxDate: null,
    firstRegistrationDate: null,
    revisionKmInterval: null,
    revisionYearInterval: null,
    activeMaintenance: {
        id: 'm-1',
        startDate: START_ISO,
        endDate: END_ISO,
        reason: 'Panne embrayage',
    },
    trips: [],
};

function renderBanner(overrides: Partial<React.ComponentProps<typeof MaintenanceBanner>> = {}) {
    return render(
        <MaintenanceBanner
            vehicle={baseVehicle}
            userRoles={['ADMIN']}
            canEndMaintenance
            onEndMaintenance={vi.fn()}
            {...overrides}
        />,
    );
}

describe('MaintenanceBanner — bouton « Remettre en service »', () => {
    it('ADMIN + canEndMaintenance → bouton présent', () => {
        renderBanner();
        expect(screen.getByRole('button', { name: END_LABEL })).toBeTruthy();
    });

    it('ADMIN mais trajet ouvert (canEndMaintenance false) → bouton ABSENT', () => {
        renderBanner({ canEndMaintenance: false });
        expect(screen.queryByRole('button', { name: END_LABEL })).toBeNull();
    });

    it('non-ADMIN malgré canEndMaintenance → bouton absent', () => {
        renderBanner({ userRoles: ['CHVL'] });
        expect(screen.queryByRole('button', { name: END_LABEL })).toBeNull();
    });

    it('déclenche onEndMaintenance au clic', async () => {
        const onEndMaintenance = vi.fn();
        renderBanner({ onEndMaintenance });

        await userEvent.click(screen.getByRole('button', { name: END_LABEL }));
        expect(onEndMaintenance).toHaveBeenCalledTimes(1);
    });
});

describe('MaintenanceBanner — contenu', () => {
    it('affiche le libellé du bandeau quel que soit le statut du véhicule', () => {
        renderBanner({ vehicle: { ...baseVehicle, status: 'IN_USE' } });
        expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
    });

    it('affiche début, fin et raison de la maintenance active', () => {
        const { container } = renderBanner();

        expect(container.textContent).toContain(formatDate(START_ISO));
        expect(container.textContent).toContain(formatDate(END_ISO));
        expect(container.textContent).toContain('Panne embrayage');
        expect(screen.getByText('Début :')).toBeTruthy();
        expect(screen.getByText('Fin :')).toBeTruthy();
        expect(screen.getByText('Raison :')).toBeTruthy();
    });

    it('affiche « Date de fin inconnue » quand endDate est null', () => {
        const { container } = renderBanner({
            vehicle: {
                ...baseVehicle,
                activeMaintenance: { id: 'm-1', startDate: START_ISO, endDate: null, reason: 'Panne embrayage' },
            },
        });
        expect(container.textContent).toContain('Date de fin inconnue');
    });
});
