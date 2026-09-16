/**
 * Tests unitaires de `computeEffectiveStatus` — la partie pure de l'autorité de
 * recalcul maintenance ↔ `Vehicle.status`. Aucune DB : la fonction ne lit rien.
 *
 * Fichier testé : src/lib/vehicleStatusRecalc.ts
 */
import { describe, it, expect } from 'vitest';
import { computeEffectiveStatus } from '@/lib/vehicleStatusRecalc';

describe('computeEffectiveStatus — table de vérité complète', () => {
    const table: { currentStatus: string; hasActiveMaintenance: boolean; expected: string }[] = [
        { currentStatus: 'AVAILABLE', hasActiveMaintenance: true, expected: 'MAINTENANCE' },
        { currentStatus: 'MAINTENANCE', hasActiveMaintenance: true, expected: 'MAINTENANCE' },
        // La maintenance est un flag parallèle : elle ne prend jamais le pas sur IN_USE.
        { currentStatus: 'IN_USE', hasActiveMaintenance: true, expected: 'IN_USE' },
        { currentStatus: 'MAINTENANCE', hasActiveMaintenance: false, expected: 'AVAILABLE' },
        { currentStatus: 'AVAILABLE', hasActiveMaintenance: false, expected: 'AVAILABLE' },
        { currentStatus: 'IN_USE', hasActiveMaintenance: false, expected: 'IN_USE' },
        // Casse basse : la comparaison est insensible à la casse, mais la valeur
        // d'origine est retournée telle quelle — aucun écrasement cosmétique.
        { currentStatus: 'in_use', hasActiveMaintenance: true, expected: 'in_use' },
    ];

    for (const { currentStatus, hasActiveMaintenance, expected } of table) {
        it(`${currentStatus} + maintenance=${hasActiveMaintenance} → ${expected}`, () => {
            expect(computeEffectiveStatus(currentStatus, hasActiveMaintenance)).toBe(expected);
        });
    }

    it('est pure : deux appels identiques donnent le même résultat', () => {
        expect(computeEffectiveStatus('AVAILABLE', true)).toBe(computeEffectiveStatus('AVAILABLE', true));
    });
});
