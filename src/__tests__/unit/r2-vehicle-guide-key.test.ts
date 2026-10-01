// @vitest-environment node
/**
 * Clé R2 du guide de vérification d'un véhicule : préfixe dédié, versionnée par
 * tentative, et jamais détournable vers un autre préfixe du bucket.
 */
import { describe, it, expect } from 'vitest';
import { buildVehicleGuideKey, newAttemptId, R2Error } from '@/lib/r2';

describe('buildVehicleGuideKey', () => {
    it('range le guide sous vehicle-guides/<véhicule>/<tentative>.pdf', () => {
        expect(buildVehicleGuideKey('veh-182', 'abc123')).toBe('vehicle-guides/veh-182/abc123.pdf');
    });

    it('produit une clé distincte à chaque tentative (remplacement sans écrasement)', () => {
        const a = buildVehicleGuideKey('veh-182', newAttemptId());
        const b = buildVehicleGuideKey('veh-182', newAttemptId());
        expect(a).not.toBe(b);
    });

    it("assainit l'identifiant : aucune traversée de préfixe possible", () => {
        const key = buildVehicleGuideKey('../expenses/rep-1', 'abc');
        expect(key.startsWith('vehicle-guides/')).toBe(true);
        expect(key.split('/')).toHaveLength(3);
        expect(key).not.toContain('..');
    });

    it('assainit et borne le suffixe de tentative', () => {
        expect(buildVehicleGuideKey('veh', 'a/b-c_d0123456789')).toBe('vehicle-guides/veh/abcd0123.pdf');
        expect(buildVehicleGuideKey('veh', '///')).toBe('vehicle-guides/veh/x.pdf');
    });

    it('refuse un identifiant vide', () => {
        expect(() => buildVehicleGuideKey('', 'abc')).toThrow(R2Error);
    });
});
