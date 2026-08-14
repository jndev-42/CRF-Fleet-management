import { describe, it, expect } from 'vitest';
import { SUPPLIES_BY_CATEGORY, SUPPLY_CATEGORIES, MISSION_TYPE_LABELS, TEAM_DYNAMICS_LABELS, EXTERNAL_VEHICLES } from '@/lib/mission-supplies';

describe('SUPPLIES_BY_CATEGORY / SUPPLY_CATEGORIES', () => {
    it('SUPPLY_CATEGORIES couvre exactement les clés de SUPPLIES_BY_CATEGORY', () => {
        const definedKeys = Object.keys(SUPPLIES_BY_CATEGORY).sort();
        const listedKeys = [...SUPPLY_CATEGORIES].sort();
        expect(listedKeys).toEqual(definedKeys);
    });

    it('chaque catégorie a un label et au moins un article', () => {
        for (const category of SUPPLY_CATEGORIES) {
            const def = SUPPLIES_BY_CATEGORY[category];
            expect(def.label).toBeTruthy();
            expect(def.items.length).toBeGreaterThan(0);
        }
    });

    it('n\'a pas d\'articles en double au sein d\'une même catégorie', () => {
        for (const category of SUPPLY_CATEGORIES) {
            const names = SUPPLIES_BY_CATEGORY[category].items.map(i => i.name);
            expect(new Set(names).size).toBe(names.length);
        }
    });
});

describe('MISSION_TYPE_LABELS / TEAM_DYNAMICS_LABELS / EXTERNAL_VEHICLES', () => {
    it('a des labels non vides pour chaque type de mission', () => {
        for (const label of Object.values(MISSION_TYPE_LABELS)) {
            expect(label).toBeTruthy();
        }
    });

    it('a des labels non vides pour chaque dynamique d\'équipe', () => {
        for (const label of Object.values(TEAM_DYNAMICS_LABELS)) {
            expect(label).toBeTruthy();
        }
    });

    it('a un nom et un type pour chaque véhicule externe', () => {
        for (const vehicle of Object.values(EXTERNAL_VEHICLES)) {
            expect(vehicle.name).toBeTruthy();
            expect(vehicle.type).toBeTruthy();
        }
    });
});
