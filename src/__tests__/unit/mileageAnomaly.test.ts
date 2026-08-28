import { describe, it, expect } from 'vitest';
import {
    MAX_KM_PER_DAY,
    checkMileageAnomaly,
    elapsedDays,
    formatElapsed,
    negativeMileageMessage,
} from '@/lib/utils/mileageAnomaly';

// `now` est TOUJOURS injecté explicitement : aucun test ne dépend de l'horloge réelle.
const NOW = new Date('2026-08-25T12:00:00.000Z');

/** Date de départ située `hours` heures avant NOW (négatif = dans le futur). */
function hoursAgo(hours: number): string {
    return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

describe('MAX_KM_PER_DAY', () => {
    it('vaut 150', () => {
        expect(MAX_KM_PER_DAY).toBe(150);
    });
});

describe('elapsedDays', () => {
    it('retourne 1 quand checkOutAt est illisible (garde Number.isFinite)', () => {
        expect(elapsedDays('pas-une-date', NOW)).toBe(1);
    });

    it('retourne 1 quand checkOutAt est dans le futur (5 h)', () => {
        expect(elapsedDays(hoursAgo(-5), NOW)).toBe(1);
    });

    it('retourne 1 pour 3 h écoulées', () => {
        expect(elapsedDays(hoursAgo(3), NOW)).toBe(1);
    });

    it('retourne 2 pour 25 h écoulées', () => {
        expect(elapsedDays(hoursAgo(25), NOW)).toBe(2);
    });
});

describe('checkMileageAnomaly', () => {
    it('retourne "negative" pour un delta négatif', () => {
        expect(checkMileageAnomaly(9_900, 10_000, hoursAgo(3), NOW)).toBe('negative');
    });

    it('retourne "excessive" pour 200 km en 3 h', () => {
        expect(checkMileageAnomaly(10_200, 10_000, hoursAgo(3), NOW)).toBe('excessive');
    });

    it('retourne null pour 140 km en 3 h', () => {
        expect(checkMileageAnomaly(10_140, 10_000, hoursAgo(3), NOW)).toBeNull();
    });

    it('retourne null pour 400 km en 3 jours', () => {
        expect(checkMileageAnomaly(10_400, 10_000, hoursAgo(72), NOW)).toBeNull();
    });

    it('retourne "excessive" pour 500 km en 3 jours', () => {
        expect(checkMileageAnomaly(10_500, 10_000, hoursAgo(72), NOW)).toBe('excessive');
    });

    it('retourne null pour un delta nul', () => {
        expect(checkMileageAnomaly(10_000, 10_000, hoursAgo(3), NOW)).toBeNull();
    });

    it('retourne null sur la borne exacte delta === 150 * jours', () => {
        expect(checkMileageAnomaly(10_150, 10_000, hoursAgo(3), NOW)).toBeNull();
    });

    // Régression : sans la garde Number.isFinite dans elapsedDays, cet appel
    // retourne null (Math.max(1, NaN) === NaN → delta > NaN → false).
    it('reste actif quand checkOutAt est illisible', () => {
        expect(checkMileageAnomaly(99_999, 0, 'pas-une-date', NOW)).toBe('excessive');
    });
});

describe('formatElapsed', () => {
    it('45 min → « moins d’une heure »', () => {
        expect(formatElapsed(hoursAgo(0.75), NOW)).toBe('moins d’une heure');
    });

    it('5 h → « 5 h »', () => {
        expect(formatElapsed(hoursAgo(5), NOW)).toBe('5 h');
    });

    it('23 h 59 → « 23 h »', () => {
        expect(formatElapsed(hoursAgo(23 + 59 / 60), NOW)).toBe('23 h');
    });

    it('24 h 00 → « 1 jour »', () => {
        expect(formatElapsed(hoursAgo(24), NOW)).toBe('1 jour');
    });

    it('36 h → « 1 jour et 12 h »', () => {
        expect(formatElapsed(hoursAgo(36), NOW)).toBe('1 jour et 12 h');
    });

    it('48 h → « 2 jours »', () => {
        expect(formatElapsed(hoursAgo(48), NOW)).toBe('2 jours');
    });

    it('date illisible → « durée inconnue »', () => {
        expect(formatElapsed('pas-une-date', NOW)).toBe('durée inconnue');
    });
});

describe('negativeMileageMessage', () => {
    it('formate le kilométrage en français et nomme la conséquence et le recours', () => {
        const message = negativeMileageMessage(10_000);
        // toLocaleString('fr-FR') sépare les milliers par une espace insécable étroite (U+202F)
        expect(message).toMatch(/10\s000 km/);
        expect(message).toContain('inférieur au kilométrage de départ');
        expect(message).toContain('indisponible');
        expect(message).toContain('responsable');
    });
});
