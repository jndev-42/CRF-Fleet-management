// @vitest-environment node
/**
 * Clés R2 des documents et photos de véhicule (rangées par UL et par nom de
 * véhicule, versionnées par tentative, jamais détournables vers un autre préfixe)
 * et clés de justificatifs en attente (`isExpenseStagingKey`).
 */
import { describe, it, expect } from 'vitest';
import {
    buildExpenseStagingKey,
    buildVehicleGuideKey,
    buildVehiclePhotoKey,
    hasDotSegment,
    isExpenseStagingKey,
    newAttemptId,
    parseExpenseStagingKey,
    R2Error,
} from '@/lib/r2';

const SID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('buildVehicleGuideKey', () => {
    it('range le document sous vehicle-documents/<UL>/<nom du véhicule>/<tentative>.pdf', () => {
        expect(buildVehicleGuideKey('paris-18', 'VSAV 1', 'abc123')).toBe('vehicle-documents/paris-18/vsav-1/abc123.pdf');
    });

    it('produit une clé distincte à chaque tentative (remplacement sans écrasement)', () => {
        const a = buildVehicleGuideKey('paris-18', 'VSAV 1', newAttemptId());
        const b = buildVehicleGuideKey('paris-18', 'VSAV 1', newAttemptId());
        expect(a).not.toBe(b);
    });

    it("assainit le nom : aucune traversée de préfixe possible ; repli sans-nom", () => {
        const key = buildVehicleGuideKey('paris-18', '../expenses/rep-1', 'abc');
        expect(key).toBe('vehicle-documents/paris-18/expenses-rep-1/abc.pdf');
        expect(buildVehicleGuideKey('paris-18', '///', 'abc')).toBe('vehicle-documents/paris-18/sans-nom/abc.pdf');
        expect(buildVehicleGuideKey('paris-18', null, 'abc')).toBe('vehicle-documents/paris-18/sans-nom/abc.pdf');
    });

    it('assainit et borne le suffixe de tentative', () => {
        expect(buildVehicleGuideKey('ul', 'veh', 'a/b-c_d0123456789')).toBe('vehicle-documents/ul/veh/abcd0123.pdf');
        expect(buildVehicleGuideKey('ul', 'veh', '///')).toBe('vehicle-documents/ul/veh/x.pdf');
    });

    it('refuse un segment UL vide ou invalide', () => {
        expect(() => buildVehicleGuideKey('', 'veh', 'abc')).toThrow(R2Error);
        expect(() => buildVehicleGuideKey('../x', 'veh', 'abc')).toThrow(R2Error);
        expect(() => buildVehicleGuideKey('a/b', 'veh', 'abc')).toThrow(R2Error);
    });
});

describe('buildVehiclePhotoKey', () => {
    it('range la photo sous vehicle-photos/<UL>/<nom du véhicule>/<tentative>.jpg', () => {
        expect(buildVehiclePhotoKey('paris-18', 'VSAV 1', 'ab12cd34')).toBe('vehicle-photos/paris-18/vsav-1/ab12cd34.jpg');
    });

    it('refuse un segment UL invalide', () => {
        expect(() => buildVehiclePhotoKey('', 'VSAV 1', 'a')).toThrow(R2Error);
    });
});

describe('buildExpenseStagingKey', () => {
    it('range le justificatif sous expenses-staging/<UL>/<stagingId>/<uuid>-<nom>', () => {
        expect(buildExpenseStagingKey('paris-18', SID, 'facture.pdf'))
            .toMatch(new RegExp(`^expenses-staging/paris-18/${SID}/[0-9a-f-]{36}-facture\\.pdf$`));
    });

    it('refuse un stagingId vide ou porteur de séparateurs, ou un segment UL invalide', () => {
        expect(() => buildExpenseStagingKey('paris-18', '../ndf', 'x.jpg')).toThrow(R2Error);
        expect(() => buildExpenseStagingKey('paris-18', '', 'x.jpg')).toThrow(R2Error);
        expect(() => buildExpenseStagingKey('', SID, 'x.jpg')).toThrow(R2Error);
    });

    it('produit une clé de dépôt de son UL, même pour un nom hostile', () => {
        const key = buildExpenseStagingKey('paris-18', SID, '../../etc/passwd');
        expect(key.split('/')).toHaveLength(4);
        expect(isExpenseStagingKey(key, 'paris-18')).toBe(true);
    });
});

describe('isExpenseStagingKey / parseExpenseStagingKey', () => {
    it('accepte la nouvelle forme sous le segment de la note', () => {
        expect(isExpenseStagingKey(`expenses-staging/paris-18/${SID}/abc-ticket.jpg`, 'paris-18')).toBe(true);
    });

    it("refuse la nouvelle forme d'une autre UL", () => {
        expect(isExpenseStagingKey(`expenses-staging/paris-17/${SID}/abc-ticket.jpg`, 'paris-18')).toBe(false);
    });

    it("l'ancienne forme se découpe (UUID ou non), mais n'est pas une clé de l'UL", () => {
        expect(parseExpenseStagingKey(`expenses-staging/${SID}/abc-ticket.jpg`)).toEqual({ ulSegment: null, stagingId: SID, file: 'abc-ticket.jpg' });
        expect(parseExpenseStagingKey('expenses-staging/s1/a.jpg')).toEqual({ ulSegment: null, stagingId: 's1', file: 'a.jpg' });
        expect(isExpenseStagingKey(`expenses-staging/${SID}/abc-ticket.jpg`, 'paris-18')).toBe(false);
    });

    it('un nom de fichier contenant .. est accepté ; un segment .. jamais', () => {
        expect(parseExpenseStagingKey(`expenses-staging/paris-18/${SID}/facture..pdf`)?.file).toBe('facture..pdf');
        expect(hasDotSegment(`expenses-staging/paris-18/${SID}/../x.pdf`)).toBe(true);
        expect(hasDotSegment(`expenses-staging/paris-18/${SID}/a..b.pdf`)).toBe(false);
    });

    it('refuse toute clé forgée', () => {
        for (const key of [
            'ndf-revisions/paris-18/rep-1-v1-abc.pdf',
            'ndf/paris-18/x/note-de-frais.pdf',
            `expenses-staging/paris-18/${SID}/../../ndf/x.pdf`,
            `expenses-staging/paris-18/${SID}/..`,
            `expenses-staging/paris-18/./x.jpg`,
            `expenses-staging/${SID}/sous/dossier.jpg`,
            `expenses-staging/paris-18/${SID}/a b.jpg`,
            `expenses-staging/paris-18/${SID}/`,
            `expenses-staging/paris-18/${SID}/a/b.jpg`,
            'referentiels/x.pdf',
            '',
        ]) {
            expect(isExpenseStagingKey(key, 'paris-18'), key).toBe(false);
        }
        expect(isExpenseStagingKey(42, 'paris-18')).toBe(false);
    });
});
