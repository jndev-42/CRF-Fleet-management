import { describe, it, expect } from 'vitest';
import { formatIsoDayFr } from '@/lib/utils/date';

describe('formatIsoDayFr', () => {
    it('convertit une date ISO calendaire au format français', () => {
        expect(formatIsoDayFr('2026-03-12')).toBe('12/03/2026');
        expect(formatIsoDayFr('2026-01-01')).toBe('01/01/2026');
        expect(formatIsoDayFr('2026-12-31')).toBe('31/12/2026');
    });

    it('ne dépend pas du fuseau horaire du serveur', () => {
        const original = process.env.TZ;
        try {
            process.env.TZ = 'America/New_York';
            expect(formatIsoDayFr('2026-03-12')).toBe('12/03/2026');
            process.env.TZ = 'Pacific/Kiritimati';
            expect(formatIsoDayFr('2026-03-12')).toBe('12/03/2026');
        } finally {
            process.env.TZ = original;
        }
    });

    it('renvoie l\'entrée telle quelle si le format n\'est pas yyyy-MM-dd', () => {
        expect(formatIsoDayFr('12/03/2026')).toBe('12/03/2026');
        expect(formatIsoDayFr('2026-03-12T10:00:00Z')).toBe('2026-03-12T10:00:00Z');
        expect(formatIsoDayFr('')).toBe('');
    });
});
