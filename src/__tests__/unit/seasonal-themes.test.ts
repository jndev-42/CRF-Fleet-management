import { describe, it, expect } from 'vitest';
import {
    SEASONAL_THEMES,
    parisToday,
    isThemeActive,
    pickActiveTheme,
    rangesOverlap,
    themeStatus,
    type ThemeRow,
} from '@/lib/themes/catalog';

const row = (over: Partial<ThemeRow> = {}): ThemeRow => ({
    theme_key: 'vendanges-montmartre',
    enabled: true,
    start_date: '2026-10-07',
    end_date: '2026-10-12',
    ...over,
});

describe('catalogue', () => {
    it('contient le thème des vendanges de Montmartre', () => {
        expect(SEASONAL_THEMES.map(t => t.key)).toContain('vendanges-montmartre');
    });
});

describe('parisToday', () => {
    it('lit le jour à Paris (été, UTC+2) : 22h30 UTC passe au lendemain', () => {
        expect(parisToday(new Date('2026-10-12T22:30:00Z'))).toBe('2026-10-13');
    });

    it('minuit Paris : 21h59 UTC est encore la veille, 22h00 UTC est le lendemain', () => {
        expect(parisToday(new Date('2026-10-12T21:59:00Z'))).toBe('2026-10-12');
        expect(parisToday(new Date('2026-10-12T22:00:00Z'))).toBe('2026-10-13');
    });

    it('hiver (UTC+1)', () => {
        expect(parisToday(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
    });
});

describe('isThemeActive', () => {
    it('bornes incluses', () => {
        expect(isThemeActive(row(), '2026-10-07')).toBe(true);
        expect(isThemeActive(row(), '2026-10-12')).toBe(true);
    });

    it('hors plage', () => {
        expect(isThemeActive(row(), '2026-10-06')).toBe(false);
        expect(isThemeActive(row(), '2026-10-13')).toBe(false);
    });

    it('désactivé ou dates absentes', () => {
        expect(isThemeActive(row({ enabled: false }), '2026-10-08')).toBe(false);
        expect(isThemeActive(row({ start_date: null }), '2026-10-08')).toBe(false);
        expect(isThemeActive(row({ end_date: null }), '2026-10-08')).toBe(false);
    });
});

describe('pickActiveTheme', () => {
    it('renvoie le thème actif', () => {
        expect(pickActiveTheme([row()], '2026-10-08')?.theme_key).toBe('vendanges-montmartre');
    });

    it('renvoie null sans thème actif', () => {
        expect(pickActiveTheme([row()], '2026-11-01')).toBeNull();
        expect(pickActiveTheme([], '2026-10-08')).toBeNull();
    });

    it('ignore les clés hors catalogue', () => {
        expect(pickActiveTheme([row({ theme_key: 'inconnu' })], '2026-10-08')).toBeNull();
    });
});

describe('rangesOverlap', () => {
    it('recouvrement partiel, inclusion et contact sur une borne', () => {
        expect(rangesOverlap({ start: '2026-10-01', end: '2026-10-10' }, { start: '2026-10-10', end: '2026-10-20' })).toBe(true);
        expect(rangesOverlap({ start: '2026-10-01', end: '2026-10-31' }, { start: '2026-10-05', end: '2026-10-06' })).toBe(true);
    });

    it('plages disjointes, y compris à un jour d\'écart', () => {
        expect(rangesOverlap({ start: '2026-10-01', end: '2026-10-09' }, { start: '2026-10-10', end: '2026-10-20' })).toBe(false);
        expect(rangesOverlap({ start: '2026-11-01', end: '2026-11-05' }, { start: '2026-10-01', end: '2026-10-05' })).toBe(false);
    });
});

describe('themeStatus', () => {
    it('actif / programmé / inactif', () => {
        expect(themeStatus(row(), '2026-10-08')).toBe('active');
        expect(themeStatus(row(), '2026-10-01')).toBe('scheduled');
        expect(themeStatus(row(), '2026-10-13')).toBe('inactive');
        expect(themeStatus(row({ enabled: false }), '2026-10-08')).toBe('inactive');
        expect(themeStatus(row({ start_date: null }), '2026-10-08')).toBe('inactive');
    });
});
