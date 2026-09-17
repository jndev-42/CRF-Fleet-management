/**
 * Tests unitaires du prédicat de clôture de maintenance.
 *
 * Fichier testé : src/lib/maintenanceStatus.ts
 *
 * ⚠️ Fixtures date-seule dérivées de `toISOString()` (arithmétique en millisecondes),
 * JAMAIS d'arithmétique locale : le prédicat compare en UTC, et une fixture construite
 * avec `getDate()` / `setDate()` ferait flaker les deux derniers cas 1 à 2 h par jour
 * en `Europe/Paris`.
 */
import { describe, it, expect } from 'vitest';
import { isMaintenanceClosed, isMaintenanceEditable } from '@/lib/maintenanceStatus';

const DAY_MS = 86_400_000;

const todayUTC = new Date().toISOString().split('T')[0];
const yesterdayUTC = new Date(Date.now() - DAY_MS).toISOString().split('T')[0];
const futureISO = new Date(Date.now() + DAY_MS).toISOString();
const pastISO = new Date(Date.now() - DAY_MS).toISOString();

/** Table de vérité partagée par les deux prédicats — `isMaintenanceEditable` en est l'inverse strict. */
const cases: { label: string; endDate: string | null | undefined; closed: boolean }[] = [
    { label: 'endDate null (fin inconnue)', endDate: null, closed: false },
    { label: 'endDate undefined', endDate: undefined, closed: false },
    { label: 'endDate chaîne vide', endDate: '', closed: false },
    { label: 'endDate ISO dans le futur', endDate: futureISO, closed: false },
    { label: 'endDate ISO dans le passé', endDate: pastISO, closed: true },
    { label: 'endDate date-seule du jour (UTC)', endDate: todayUTC, closed: false },
    { label: 'endDate date-seule de la veille (UTC)', endDate: yesterdayUTC, closed: true },
];

describe('isMaintenanceClosed', () => {
    for (const { label, endDate, closed } of cases) {
        it(`${label} → ${closed}`, () => {
            expect(isMaintenanceClosed(endDate)).toBe(closed);
        });
    }

    it('accepte une horloge injectée (`now`) plutôt que la date système', () => {
        const now = new Date('2026-07-20T12:00:00.000Z');
        expect(isMaintenanceClosed('2026-07-20T11:59:59.000Z', now)).toBe(true);
        expect(isMaintenanceClosed('2026-07-20T12:00:01.000Z', now)).toBe(false);
        // Date-seule du jour : encore éditable, même en fin de journée UTC.
        expect(isMaintenanceClosed('2026-07-20', now)).toBe(false);
        expect(isMaintenanceClosed('2026-07-19', now)).toBe(true);
    });
});

describe('isMaintenanceEditable', () => {
    for (const { label, endDate, closed } of cases) {
        it(`${label} → ${!closed} (inverse strict)`, () => {
            expect(isMaintenanceEditable(endDate)).toBe(!closed);
            expect(isMaintenanceEditable(endDate)).toBe(!isMaintenanceClosed(endDate));
        });
    }
});
