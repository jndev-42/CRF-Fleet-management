import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MaintenanceCard from '@/components/vehicle/MaintenanceCard';
import type { Vehicle, MaintenanceRecord } from '@/app/vehicles/[id]/types';

function isoDaysFromNow(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return localIso(d);
}

function localIso(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

function dateYearsBefore(date: string, years: number): string {
    const [y, m, day] = date.split('-').map(Number);
    return localIso(new Date(y - years, m - 1, day));
}

const vehicleBase = {
    type: 'VL', mileage: 20000, firstRegistrationDate: null,
    revisionKmInterval: null, revisionYearInterval: 1,
} as unknown as Vehicle;

function rec(type: MaintenanceRecord['type'], date: string): MaintenanceRecord {
    return { id: `r-${type}`, vehicleId: 'v', date, type, mileage: null, createdAt: date } as MaintenanceRecord;
}

describe('MaintenanceCard', () => {
    it('nomme l\'échéance la plus proche et affiche les deux lignes', () => {
        // CT dans ~9 mois (dernier CT il y a 2 ans − 270 j), révision dans 18 jours.
        const ctDate = dateYearsBefore(isoDaysFromNow(270), 2);
        const revDate = dateYearsBefore(isoDaysFromNow(18), 1);
        render(<MaintenanceCard vehicle={vehicleBase} records={[rec('CT', ctDate), rec('REVISION', revDate)]} onClick={() => {}} />);
        expect(screen.getByText('Révision dans 18 jours')).toBeTruthy();
        expect(screen.getByText(/Contrôle technique : dans 9 mois/)).toBeTruthy();
        expect(screen.getByText(/Révision : dans 18 jours/)).toBeTruthy();
    });

    it('sans révision connue : pas de km inventés', () => {
        const v = { ...vehicleBase, revisionKmInterval: 30000, revisionYearInterval: 2, firstRegistrationDate: isoDaysFromNow(-100) } as Vehicle;
        render(<MaintenanceCard vehicle={v} records={[]} onClick={() => {}} />);
        const line = screen.getByText(/^Révision :/);
        expect(line.textContent).not.toMatch(/km/);
    });

    it('intervalle km seul : « dans N km », sans date', () => {
        const v = { ...vehicleBase, mileage: 52000, revisionKmInterval: 30000, revisionYearInterval: null } as Vehicle;
        const r = { ...rec('REVISION', isoDaysFromNow(-200)), mileage: 40000 } as MaintenanceRecord;
        render(<MaintenanceCard vehicle={v} records={[r]} onClick={() => {}} />);
        expect(screen.getByText(/^Révision :/).textContent).toBe('Révision : dans 18\u202f000 km');
    });

    it('date et km non dépassés : « dans X ou N km »', () => {
        const v = { ...vehicleBase, mileage: 52000, revisionKmInterval: 30000, revisionYearInterval: 1 } as Vehicle;
        const r = { ...rec('REVISION', dateYearsBefore(isoDaysFromNow(18), 1)), mileage: 40000 } as MaintenanceRecord;
        render(<MaintenanceCard vehicle={v} records={[r]} onClick={() => {}} />);
        expect(screen.getByText(/^Révision :/).textContent).toBe('Révision : dans 18 jours ou 18\u202f000 km');
    });

    it('km dépassés : valeur « Révision dépassée de N km » et ligne sans date', () => {
        const v = { ...vehicleBase, mileage: 72000, revisionKmInterval: 30000, revisionYearInterval: 1 } as Vehicle;
        const r = { ...rec('REVISION', dateYearsBefore(isoDaysFromNow(18), 1)), mileage: 40000 } as MaintenanceRecord;
        render(<MaintenanceCard vehicle={v} records={[r]} onClick={() => {}} />);
        expect(screen.getByText(/^Révision dépassée de/).textContent).toBe('Révision dépassée de 2\u202f000 km');
        expect(screen.getByText(/^Révision :/).textContent).toBe('Révision : dépassée de 2\u202f000 km');
    });

    it('date dépassée : la ligne n\'affiche que la date', () => {
        const v = { ...vehicleBase, mileage: 52000, revisionKmInterval: 30000, revisionYearInterval: 1 } as Vehicle;
        const r = { ...rec('REVISION', dateYearsBefore(isoDaysFromNow(-10), 1)), mileage: 40000 } as MaintenanceRecord;
        render(<MaintenanceCard vehicle={v} records={[r]} onClick={() => {}} />);
        expect(screen.getByText(/^Révision :/).textContent).toBe('Révision : En retard (10 jours)');
    });
});
