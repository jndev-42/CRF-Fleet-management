/**
 * Tests de la carte véhicule (Vue DT / Vue UL) et des états de la grille de la Vue DT.
 *
 * Fichiers testés : src/app/vehicles/VehicleCard.tsx, src/app/vehicles/DtVehicleResults.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VehicleCard from '@/app/vehicles/VehicleCard';
import DtVehicleResults from '@/app/vehicles/DtVehicleResults';
import type { DashboardVehicle } from '@/app/vehicles/types';
import type { DtAvailability } from '@/lib/dtAvailability';

function vehicle(overrides: Partial<DashboardVehicle> = {}): DashboardVehicle {
    return {
        id: 'v1', name: 'VSAV 1', type: 'VPSP', plate: 'AA-111-AA', status: 'AVAILABLE', hasActiveMaintenance: false,
        parkingSpot: null, fuelLevel: 50, mileage: 1000, hasDSA: false, notes: null, vin: null,
        connection: null, fuelType: null, transmission: null, ulName: 'Paris 18', trips: [],
        ...overrides,
    };
}

const RESERVATION = {
    id: 'r1',
    startTime: '2026-10-10T06:00:00.000Z',
    endTime: '2026-10-10T10:00:00.000Z',
    userName: 'Alice Martin',
    status: 'PENDING' as const,
    reason: 'DPS semi-marathon',
};

function availability(overrides: Partial<DtAvailability>): DtAvailability {
    return { status: 'AVAILABLE', missionSince: null, reservations: [], ...overrides };
}

describe('VehicleCard — Vue DT', () => {
    it('Réservé : badge et réservations (réservant, « en attente », motif)', () => {
        render(<VehicleCard vehicle={vehicle({ availability: availability({ status: 'RESERVED', reservations: [RESERVATION] }) })} isDtView renaultData={undefined} isFirst />);

        expect(screen.getByLabelText('Statut : Réservé').textContent).toContain('Réservé');
        const list = screen.getByRole('list', { name: 'Réservations sur la période' });
        expect(list.textContent).toContain('Alice Martin');
        expect(list.textContent).toContain('en attente');
        expect(list.textContent).toContain('DPS semi-marathon');
        expect(screen.getByText('UL Paris 18')).toBeTruthy();
    });

    it('réservation validée : « validée »', () => {
        render(<VehicleCard vehicle={vehicle({ availability: availability({ status: 'RESERVED', reservations: [{ ...RESERVATION, status: 'VALIDATED', reason: null }] }) })} isDtView renaultData={undefined} isFirst />);
        expect(screen.getByRole('list', { name: 'Réservations sur la période' }).textContent).toContain('validée');
    });

    it('Potentiellement disponible : badge et « En mission depuis le JJ/MM/AAAA »', () => {
        render(<VehicleCard vehicle={vehicle({ availability: availability({ status: 'POTENTIAL', missionSince: '2026-10-06T10:00:00.000Z' }) })} isDtView renaultData={undefined} isFirst />);

        expect(screen.getByLabelText('Statut : Potentiellement disponible')).toBeTruthy();
        expect(screen.getByText(/En mission depuis le 06\/10\/2026/)).toBeTruthy();
    });

    it('Maintenance : les réservations chevauchantes restent affichées', () => {
        render(<VehicleCard vehicle={vehicle({ availability: availability({ status: 'MAINTENANCE', reservations: [RESERVATION] }) })} isDtView renaultData={undefined} isFirst />);

        expect(screen.getByLabelText('Statut : Maintenance')).toBeTruthy();
        expect(screen.getByRole('list', { name: 'Réservations sur la période' }).textContent).toContain('Alice Martin');
    });
});

describe('VehicleCard — Vue UL inchangée', () => {
    it('badge historique + 🔧 Maintenance, availability ignorée', () => {
        render(
            <VehicleCard
                vehicle={vehicle({ status: 'IN_USE', hasActiveMaintenance: true, availability: availability({ status: 'RESERVED', reservations: [RESERVATION] }) })}
                isDtView={false}
                renaultData={undefined}
                isFirst
            />,
        );

        expect(screen.getByLabelText('Statut : En mission')).toBeTruthy();
        expect(screen.getByLabelText('Statut : Maintenance en cours').textContent).toContain('🔧 Maintenance');
        expect(screen.queryByLabelText('Statut : Réservé')).toBeNull();
        expect(screen.queryByRole('list', { name: 'Réservations sur la période' })).toBeNull();
        expect(screen.queryByText('UL Paris 18')).toBeNull();
    });
});

describe('DtVehicleResults', () => {
    const base = {
        visible: [vehicle({ availability: availability({}) })],
        totalCount: 1,
        initialLoading: false,
        busy: false,
        error: null,
        periodInvalid: false,
        activeFilters: [],
        renaultData: {},
        onRetry: vi.fn(),
        onReset: vi.fn(),
    };

    it('erreur : message et Réessayer', () => {
        const onRetry = vi.fn();
        render(<DtVehicleResults {...base} error="Erreur réseau" onRetry={onRetry} />);

        expect(screen.getByRole('alert').textContent).toContain('Impossible de charger les disponibilités.');
        expect(screen.queryByText('VSAV 1')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
        expect(onRetry).toHaveBeenCalled();
    });

    it('DT sans véhicule', () => {
        render(<DtVehicleResults {...base} visible={[]} totalCount={0} />);
        expect(screen.getByText("Aucun véhicule n'est rattaché aux UL de cette Direction Territoriale.")).toBeTruthy();
    });

    it('aucun résultat : filtres actifs retirables un à un, puis Réinitialiser', () => {
        const removeVpsp = vi.fn();
        const onReset = vi.fn();
        render(
            <DtVehicleResults
                {...base}
                visible={[]}
                totalCount={3}
                activeFilters={[{ key: 'type-VPSP', label: 'VPSP', onRemove: removeVpsp }, { key: 'dispo-AVAILABLE', label: 'Disponibles', onRemove: vi.fn() }]}
                onReset={onReset}
            />,
        );

        expect(screen.getByText('Aucun véhicule ne correspond.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Retirer le filtre VPSP' }));
        expect(removeVpsp).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
        expect(onReset).toHaveBeenCalled();
    });

    it('recalcul : grille atténuée avec aria-busy', () => {
        const { container } = render(<DtVehicleResults {...base} busy />);
        const grid = container.querySelector('.vehicle-grid') as HTMLElement;
        expect(grid.getAttribute('aria-busy')).toBe('true');
        expect(grid.style.opacity).toBe('0.5');
    });

    it('premier chargement : squelettes', () => {
        render(<DtVehicleResults {...base} initialLoading />);
        expect(screen.getByRole('status', { name: 'Chargement des véhicules…' })).toBeTruthy();
    });
});
