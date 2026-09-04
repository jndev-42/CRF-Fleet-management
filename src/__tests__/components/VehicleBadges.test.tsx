import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VehicleBadges from '@/components/vehicle/VehicleBadges';
import type { Vehicle } from '@/app/vehicles/[id]/types';

const baseVehicle: Vehicle = {
    id: 'veh-1',
    name: 'VL186',
    type: 'VL',
    plate: 'HJ-269-FE',
    status: 'AVAILABLE',
    parkingSpot: 'Place A-1',
    fuelLevel: 80,
    mileage: 12000,
    hasDSA: false,
    desinfTracking: false,
    notes: null,
    vin: null,
    fuelType: 'Essence',
    transmission: null,
    maxFuelCapacity: 50,
    maxBatteryCapacityKwh: null,
    lastDesinfDate: null,
    nextDesinfMaxDate: null,
    firstRegistrationDate: null,
    revisionKmInterval: null,
    revisionYearInterval: null,
    trips: [],
};

function renderBadges(vehicle: Vehicle) {
    return render(
        <VehicleBadges vehicle={vehicle} userRoles={['CHVL']} onToggleDSA={vi.fn()} />
    );
}

describe('VehicleBadges — tag boîte de vitesses', () => {
    it('affiche le tag « Manuelle »', () => {
        renderBadges({ ...baseVehicle, transmission: 'Manuelle' });
        expect(screen.getByText('⚙️ Manuelle')).toBeTruthy();
    });

    it('affiche le tag « Automatique »', () => {
        renderBadges({ ...baseVehicle, transmission: 'Automatique' });
        expect(screen.getByText('⚙️ Automatique')).toBeTruthy();
    });

    it("n'affiche aucun tag quand la boîte n'est pas renseignée", () => {
        renderBadges(baseVehicle);
        expect(screen.queryByText('⚙️ Manuelle')).toBeNull();
        expect(screen.queryByText('⚙️ Automatique')).toBeNull();
    });
});
