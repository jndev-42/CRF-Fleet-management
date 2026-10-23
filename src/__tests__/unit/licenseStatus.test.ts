/**
 * Tests unitaires de la décision « papiers de conduite ».
 *
 * `getLicenseStatus` est extraite de `GET /api/me/license-check` pour être
 * rejouée par la garde serveur de `POST /api/trips`. Elle doit être **pure** :
 * la route est seule responsable de matérialiser l'invalidation en base, une
 * prise de véhicule ne doit jamais écrire.
 */
import { describe, it, expect } from 'vitest';
import {
    canBorrowVehicles,
    getLicenseStatus,
    INVALIDATION_GRACE_DAYS,
    VALIDATION_VALIDITY_DAYS,
    type LicenseRow,
} from '@/lib/licenseStatus';

const TODAY = '2026-09-05';

/** Date décalée de `days` par rapport à TODAY, au format YYYY-MM-DD. */
function daysFromToday(days: number): string {
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function row(overrides: Partial<LicenseRow> = {}): LicenseRow {
    return {
        papiers_valides: 1,
        last_validation: daysFromToday(-10),
        start_date_invalidation_process: null,
        ...overrides,
    };
}

describe('canBorrowVehicles', () => {
    it('vrai pour les chauffeurs et les gestionnaires de flotte', () => {
        for (const roles of [['CHVL'], ['CHVPSP'], ['ADMIN'], ['RESP_VEHICULE'], ['SUPER_ADMIN']]) {
            expect(canBorrowVehicles(roles)).toBe(true);
        }
    });

    it('faux pour les comptes qui n\'empruntent jamais, et pour un INACTIF', () => {
        for (const roles of [['TRESORIER'], ['PRESIDENT'], ['DT'], [], ['CHVL', 'INACTIF']]) {
            expect(canBorrowVehicles(roles)).toBe(false);
        }
    });
});

describe('getLicenseStatus', () => {
    it('papiers valides et validation récente → non bloqué', () => {
        const status = getLicenseStatus(row(), TODAY);
        expect(status.validated).toBe(true);
        expect(status.blocked).toBe(false);
        expect(status.daysLeft).toBeNull();
        expect(status.startDateToPersist).toBeNull();
        expect(status.justInvalidated).toBe(false);
    });

    it('validation absente → invalidation constatée, délai de grâce démarré aujourd\'hui', () => {
        const status = getLicenseStatus(row({ last_validation: null }), TODAY);
        expect(status.validated).toBe(false);
        expect(status.justInvalidated).toBe(true);
        expect(status.startDateToPersist).toBe(TODAY);
        // Le délai de grâce vient de démarrer : pas encore bloqué.
        expect(status.blocked).toBe(false);
        expect(status.daysLeft).toBe(INVALIDATION_GRACE_DAYS);
    });

    it('validation expirée (> 182 j) alors que papiers_valides = 1 → transition', () => {
        const expired = daysFromToday(-(VALIDATION_VALIDITY_DAYS + 1));
        const status = getLicenseStatus(row({ last_validation: expired }), TODAY);
        expect(status.validated).toBe(false);
        expect(status.justInvalidated).toBe(true);
        expect(status.startDateToPersist).toBe(TODAY);
    });

    it('validation encore valide à la limite des 182 jours → reste valide', () => {
        const almost = daysFromToday(-(VALIDATION_VALIDITY_DAYS - 1));
        const status = getLicenseStatus(row({ last_validation: almost }), TODAY);
        expect(status.validated).toBe(true);
        expect(status.blocked).toBe(false);
    });

    it('déjà invalide sans date de départ → la date est posée, sans re-transition', () => {
        const status = getLicenseStatus(
            row({ papiers_valides: 0, last_validation: null, start_date_invalidation_process: null }),
            TODAY,
        );
        expect(status.startDateToPersist).toBe(TODAY);
        expect(status.justInvalidated).toBe(false);
    });

    it('dans le délai de grâce → non bloqué, jours restants corrects', () => {
        const startedDaysAgo = 4;
        const status = getLicenseStatus(
            row({
                papiers_valides: 0,
                last_validation: null,
                start_date_invalidation_process: daysFromToday(-startedDaysAgo),
            }),
            TODAY,
        );
        expect(status.blocked).toBe(false);
        expect(status.daysLeft).toBe(INVALIDATION_GRACE_DAYS - startedDaysAgo);
        // Date déjà enregistrée : rien à réécrire.
        expect(status.startDateToPersist).toBeNull();
    });

    it('à l\'expiration du délai de grâce → bloqué, 0 jour restant', () => {
        const status = getLicenseStatus(
            row({
                papiers_valides: 0,
                last_validation: null,
                start_date_invalidation_process: daysFromToday(-INVALIDATION_GRACE_DAYS),
            }),
            TODAY,
        );
        expect(status.blocked).toBe(true);
        expect(status.daysLeft).toBe(0);
    });

    it('bien après le délai de grâce → toujours bloqué, jours restants plancher à 0', () => {
        const status = getLicenseStatus(
            row({
                papiers_valides: 0,
                last_validation: null,
                start_date_invalidation_process: daysFromToday(-(INVALIDATION_GRACE_DAYS + 30)),
            }),
            TODAY,
        );
        expect(status.blocked).toBe(true);
        expect(status.daysLeft).toBe(0);
    });

    it('papiers invalides sans date de départ connue → pas de blocage calculable', () => {
        // `last_validation` récente : la branche « expirée » ne s'applique pas, donc
        // aucune date n'est posée et le blocage reste indéterminé.
        const status = getLicenseStatus(
            row({ papiers_valides: 0, start_date_invalidation_process: null }),
            TODAY,
        );
        expect(status.validated).toBe(false);
        expect(status.daysLeft).toBeNull();
        expect(status.blocked).toBe(false);
    });

    it('délai de grâce traversant un changement d\'heure → jours restants exacts', () => {
        const previousTz = process.env.TZ;
        process.env.TZ = 'Europe/Paris';
        try {
            // Passage à l'heure d'hiver le 25 octobre 2026, dans les 14 jours.
            const status = getLicenseStatus(
                row({ papiers_valides: 0, start_date_invalidation_process: '2026-10-17' }),
                '2026-10-17',
            );
            expect(status.daysLeft).toBe(INVALIDATION_GRACE_DAYS);
            expect(status.blocked).toBe(false);
        } finally {
            process.env.TZ = previousTz;
        }
    });

    it('est pure : ne modifie pas la ligne reçue', () => {
        const input = row({ papiers_valides: 1, last_validation: null });
        const snapshot = JSON.stringify(input);
        getLicenseStatus(input, TODAY);
        expect(JSON.stringify(input)).toBe(snapshot);
    });
});
