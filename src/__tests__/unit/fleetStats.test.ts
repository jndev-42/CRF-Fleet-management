import { describe, it, expect } from 'vitest';
import { computeFleetStats, countsAsMaintenance, type FleetStatsVehicle } from '@/lib/fleetStats';

function v(status: string, hasActiveMaintenance = false): FleetStatsVehicle {
    return { status, hasActiveMaintenance };
}

describe('countsAsMaintenance', () => {
    it('retient un véhicule au statut MAINTENANCE', () => {
        expect(countsAsMaintenance(v('MAINTENANCE'))).toBe(true);
    });

    it('retient un véhicule EMPRUNTÉ portant une maintenance active', () => {
        expect(countsAsMaintenance(v('IN_USE', true))).toBe(true);
    });

    it('ignore un véhicule emprunté sans maintenance', () => {
        expect(countsAsMaintenance(v('IN_USE'))).toBe(false);
    });

    it('ignore un véhicule disponible', () => {
        expect(countsAsMaintenance(v('AVAILABLE'))).toBe(false);
    });
});

describe('computeFleetStats', () => {
    // VERROU DE COMPORTEMENT PRODUIT : la maintenance prime sur l'emprunt dans les
    // compteurs. Un véhicule parti à l'atelier n'est pas « mobilisable en mission ».
    it('compte un véhicule IN_USE + maintenance sous Maintenance, pas sous En mission', () => {
        const stats = computeFleetStats([v('IN_USE', true)]);

        expect(stats.maintenance).toBe(1);
        expect(stats.inUse).toBe(0);
    });

    it('ne le compte qu\'une seule fois — les trois catégories somment au total', () => {
        const fleet = [
            v('AVAILABLE'),
            v('AVAILABLE'),
            v('IN_USE'),
            v('IN_USE', true),   // à l'atelier, conduit par quelqu'un
            v('MAINTENANCE'),
        ];

        const stats = computeFleetStats(fleet);

        expect(stats).toEqual({ total: 5, available: 2, inUse: 1, maintenance: 2 });
        expect(stats.available + stats.inUse + stats.maintenance).toBe(stats.total);
    });

    it('laisse intacts les compteurs sans aucune maintenance', () => {
        const stats = computeFleetStats([v('AVAILABLE'), v('IN_USE'), v('IN_USE')]);

        expect(stats).toEqual({ total: 3, available: 1, inUse: 2, maintenance: 0 });
    });

    it('classe en maintenance un véhicule AVAILABLE portant le flag, sans double compte', () => {
        // État que le recalcul de statut ne produit pas, mais les catégories doivent
        // rester disjointes quoi qu'il arrive en entrée.
        const stats = computeFleetStats([v('AVAILABLE', true)]);

        expect(stats).toEqual({ total: 1, available: 0, inUse: 0, maintenance: 1 });
    });

    it('rend des compteurs à zéro sur une flotte vide', () => {
        expect(computeFleetStats([])).toEqual({ total: 0, available: 0, inUse: 0, maintenance: 0 });
    });

    it('ignore un statut inconnu dans les trois catégories mais le compte dans le total', () => {
        const stats = computeFleetStats([v('AVAILABLE'), v('INCONNU')]);

        expect(stats).toEqual({ total: 2, available: 1, inUse: 0, maintenance: 0 });
    });
});
