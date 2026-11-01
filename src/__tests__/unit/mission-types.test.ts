import { describe, it, expect } from 'vitest';
import {
    MISSION_TYPES,
    DESINFECTION_MISSION_TYPE,
    isMissionType,
    isVpspVehicleType,
    missionTypesForVehicle,
    missionTypeLabel,
} from '@/lib/mission-types';
import { missionTypeSchema } from '@/app/api/trips/schema';

describe('MISSION_TYPES', () => {
    it('contient « Entraînement » et aucun doublon', () => {
        expect(MISSION_TYPES).toContain('Entraînement');
        expect(new Set(MISSION_TYPES).size).toBe(MISSION_TYPES.length);
    });
});

describe('isMissionType', () => {
    it('accepte une valeur de la liste', () => {
        expect(isMissionType('Entraînement')).toBe(true);
    });

    it.each(['Entrainement', 'logistique', '', 'Poste de secours', null, undefined, 3])(
        'refuse %s',
        (value) => expect(isMissionType(value)).toBe(false),
    );
});

describe('isVpspVehicleType', () => {
    it.each([['VPSP', true], ['vpsp 2', true], ['VL', false], ['', false], [null, false], [undefined, false]] as const)(
        '%s → %s',
        (type, expected) => expect(isVpspVehicleType(type)).toBe(expected),
    );
});

describe('missionTypesForVehicle', () => {
    it('propose la désinfection pour un VPSP', () => {
        expect(missionTypesForVehicle('VPSP')).toEqual([...MISSION_TYPES]);
    });

    it("ne propose pas la désinfection pour un autre véhicule, sans rien retirer d'autre", () => {
        const types = missionTypesForVehicle('VL');
        expect(types).not.toContain(DESINFECTION_MISSION_TYPE);
        expect(types).toHaveLength(MISSION_TYPES.length - 1);
        expect(types).toContain('Entraînement');
    });
});

describe('missionTypeLabel', () => {
    it('décore la désinfection', () => {
        expect(missionTypeLabel('Désinfection')).toBe('🧴 Désinfection');
    });

    it('laisse les autres types tels quels', () => {
        expect(missionTypeLabel('Entraînement')).toBe('Entraînement');
    });
});

describe('missionTypeSchema', () => {
    it('accepte une valeur de la liste', () => {
        expect(missionTypeSchema.safeParse('Entraînement').success).toBe(true);
    });

    it('signale un type inconnu', () => {
        const result = missionTypeSchema.safeParse('Entrainement');
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Type de mission inconnu');
    });

    it.each([undefined, ''])('signale un type manquant (%s)', (value) => {
        const result = missionTypeSchema.safeParse(value);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Le type de mission est requis');
    });
});
