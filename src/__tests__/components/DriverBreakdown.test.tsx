import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DriverBreakdown from '@/components/stats/DriverBreakdown';
import type { StatsData } from '@/components/stats/types';

const byDriver: StatsData['byDriver'] = [
    {
        driverId: 'u1', driverName: 'Jean Dupont', driverEmail: 'jean@test.com',
        tripCount: 10, totalKm: 500, percentOfTotal: 40, incidents: 2,
        avgFuelAtReturn: 60, avgLPer100km: 6.5, avgKwhPer100km: 0,
        byVehicle: [{ vehicleId: 'VL001', vehicleName: 'VL186', tripCount: 8, percentOfVehicleTotal: 80 }],
    },
    {
        driverId: 'u2', driverName: 'Marie Curie', driverEmail: 'marie@test.com',
        tripCount: 2, totalKm: 50, percentOfTotal: 5, incidents: 0,
        avgFuelAtReturn: 0, avgLPer100km: 0, avgKwhPer100km: 0,
        byVehicle: [],
    },
];

describe('DriverBreakdown', () => {
    it('affiche un état vide sans chauffeur', () => {
        render(<DriverBreakdown byDriver={[]} />);
        expect(screen.getByText('Aucune sortie sur cette période')).toBeTruthy();
    });

    it('affiche la liste des chauffeurs avec leurs statistiques', () => {
        render(<DriverBreakdown byDriver={byDriver} />);
        expect(screen.getByText('Jean Dupont')).toBeTruthy();
        expect(screen.getByText('40%')).toBeTruthy();
        expect(screen.getByText('500 km')).toBeTruthy();
    });

    it('affiche un tiret pour les moyennes non renseignées', () => {
        render(<DriverBreakdown byDriver={byDriver} />);
        const dashCells = screen.getAllByText('—');
        expect(dashCells.length).toBeGreaterThan(0);
    });

    it('déplie le détail par véhicule au clic sur une ligne', () => {
        render(<DriverBreakdown byDriver={byDriver} />);
        expect(screen.queryByText(/VL186/)).toBeNull();

        fireEvent.click(screen.getByText('Jean Dupont'));
        expect(screen.getByText(/VL186/)).toBeTruthy();
        expect(screen.getByText('8 sorties')).toBeTruthy();
    });

    it('ne réagit pas au clic pour un chauffeur sans détail véhicule', () => {
        render(<DriverBreakdown byDriver={byDriver} />);
        fireEvent.click(screen.getByText('Marie Curie'));
        expect(screen.queryByText(/sorties/)).toBeNull();
    });
});
