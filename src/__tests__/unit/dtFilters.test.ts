/**
 * Fonctions pures des filtres de la Vue DT.
 *
 * Fichier testé : src/app/vehicles/dtFilters.ts
 */
import { describe, it, expect } from 'vitest';
import { applyDtFilters, dtShortcutRange, fromLocalInputValue, toLocalInputValue } from '@/app/vehicles/dtFilters';
import type { DashboardVehicle } from '@/app/vehicles/types';
import type { DtAvailabilityStatus } from '@/lib/dtAvailability';

function vehicle(id: string, type: string, status: DtAvailabilityStatus): DashboardVehicle {
    return {
        id, name: id, type, plate: id, status: 'AVAILABLE', hasActiveMaintenance: false,
        parkingSpot: null, fuelLevel: 50, mileage: 0, hasDSA: false, notes: null, vin: null,
        connection: null, fuelType: null, transmission: null, trips: [],
        availability: { status, missionSince: null, reservations: [] },
    };
}

const VEHICLES = [
    vehicle('p1', 'VPSP', 'AVAILABLE'),
    vehicle('p2', 'VPSP', 'IN_USE'),
    vehicle('p3', 'VPSP', 'MAINTENANCE'),
    vehicle('p4', 'VPSP', 'RESERVED'),
    vehicle('l1', 'VL', 'AVAILABLE'),
];

describe('applyDtFilters — stats', () => {
    it('suivent le filtre Type mais pas le filtre Disponibilité', () => {
        const all = applyDtFilters(VEHICLES, { dispo: [], types: [] });
        expect(all.stats).toEqual({ total: 5, available: 2, inUse: 1, maintenance: 1 });

        const vpspAvailable = applyDtFilters(VEHICLES, { dispo: ['AVAILABLE'], types: ['VPSP'] });
        // Réservé compte dans le Total uniquement.
        expect(vpspAvailable.stats).toEqual({ total: 4, available: 1, inUse: 1, maintenance: 1 });
        expect(vpspAvailable.visible.map((v) => v.id)).toEqual(['p1']);
    });

    it('un type absent de la DT est ignoré', () => {
        const res = applyDtFilters(VEHICLES, { dispo: [], types: ['MOTO-INCONNUE'] });
        expect(res.activeTypes).toEqual([]);
        expect(res.visible).toHaveLength(5);
    });
});

describe('dtShortcutRange — Ce week-end', () => {
    it('en semaine : samedi 00:00 → dimanche 23:59', () => {
        const res = dtShortcutRange('weekend', new Date(2026, 9, 7, 10, 7)); // mercredi
        expect(res.from).toEqual(new Date(2026, 9, 10, 0, 0));
        expect(res.to).toEqual(new Date(2026, 9, 11, 23, 59));
    });

    it('samedi : maintenant (au quart d’heure) → dimanche 23:59', () => {
        const res = dtShortcutRange('weekend', new Date(2026, 9, 10, 14, 32));
        expect(res.from).toEqual(new Date(2026, 9, 10, 14, 30));
        expect(res.to).toEqual(new Date(2026, 9, 11, 23, 59));
    });

    it('dimanche : maintenant (au quart d’heure) → dimanche 23:59', () => {
        const res = dtShortcutRange('weekend', new Date(2026, 9, 11, 9, 50));
        expect(res.from).toEqual(new Date(2026, 9, 11, 9, 45));
        expect(res.to).toEqual(new Date(2026, 9, 11, 23, 59));
    });
});

describe('dtShortcutRange — 7 prochains jours', () => {
    it('même heure locale à J+7, y compris au changement d’heure', () => {
        // 25 octobre 2026 : passage à l'heure d'hiver en France.
        const res = dtShortcutRange('next7', new Date(2026, 9, 22, 10, 0));
        expect(res.to).toEqual(new Date(2026, 9, 29, 10, 0));
        expect(res.to.getHours()).toBe(10);
    });
});

describe('toLocalInputValue / fromLocalInputValue', () => {
    it('aller-retour en heure locale, à la minute', () => {
        const d = new Date(2026, 9, 10, 8, 5);
        const value = toLocalInputValue(d.toISOString());
        expect(value).toBe('2026-10-10T08:05');
        expect(fromLocalInputValue(value)).toEqual(d);
    });

    it('valeurs vides ou invalides', () => {
        expect(toLocalInputValue(null)).toBe('');
        expect(fromLocalInputValue('')).toBeNull();
        expect(fromLocalInputValue('pas une date')).toBeNull();
    });
});
