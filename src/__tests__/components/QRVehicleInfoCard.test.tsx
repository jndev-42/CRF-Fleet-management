import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import VehicleInfoCard from '@/app/qr/[token]/VehicleInfoCard';
import type { ActiveTrip, QRVehicle } from '@/app/qr/[token]/types';

const trip: ActiveTrip = {
    id: 't1',
    vehicleId: 'VL001',
    driverId: 'usr-1',
    secondDriverId: null,
    driverName: 'Jean Dupont',
    driverEmail: 'jean@croix-rouge.fr',
    secondDriverName: null,
    secondDriverEmail: null,
    missionType: 'DPS',
    missionName: null,
    checkOutAt: '2026-10-23T08:00:00.000Z',
    mileageOut: 12000,
    fuelOut: 40,
    conditionOut: 'Bon état',
};

const vehicle: QRVehicle = {
    id: 'VL001',
    name: 'VL186',
    plate: 'HJ-269-FE',
    type: 'VL',
    status: 'IN_USE',
    fuelLevel: 40,
    mileage: 12000,
    fuelType: 'Diesel',
    hasDSA: false,
    desinfTracking: false,
    parkingSpot: null,
    connection: null,
    maxFuelCapacity: 50,
    activeTrip: trip,
};

describe('VehicleInfoCard (QR) — véhicule emprunté', () => {
    it('affiche le conducteur seul quand il n\'y a pas de 2ème conducteur', () => {
        render(<VehicleInfoCard vehicle={vehicle} />);
        expect(screen.getByText(/En mission avec Jean Dupont$/)).toBeTruthy();
    });

    it('affiche aussi le nom du 2ème conducteur', () => {
        render(<VehicleInfoCard vehicle={{
            ...vehicle,
            activeTrip: { ...trip, secondDriverId: 'usr-2', secondDriverName: 'Marie Martin', secondDriverEmail: 'marie@croix-rouge.fr' },
        }} />);
        expect(screen.getByText(/En mission avec Jean Dupont et Marie Martin/)).toBeTruthy();
    });

    it("se rabat sur l'email du 2ème conducteur s'il n'a pas de nom", () => {
        render(<VehicleInfoCard vehicle={{
            ...vehicle,
            activeTrip: { ...trip, secondDriverId: 'usr-2', secondDriverName: null, secondDriverEmail: 'marie@croix-rouge.fr' },
        }} />);
        expect(screen.getByText(/et marie@croix-rouge\.fr/)).toBeTruthy();
    });
});
