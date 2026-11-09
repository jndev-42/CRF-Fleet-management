// @vitest-environment node
/**
 * Identifiant de dépôt signé et validation des clés de justificatifs
 * (`src/lib/expenses/receipt-keys.ts`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    issueStagingId,
    isStagingIdSignedFor,
    parseStoredReceiptKeys,
    normalizeReceiptKeys,
    receiptKeysError,
} from '@/lib/expenses/receipt-keys';

beforeEach(() => vi.stubEnv('AUTH_SECRET', 'secret-de-test'));
afterEach(() => vi.unstubAllEnvs());

describe('issueStagingId / isStagingIdSignedFor', () => {
    it('émet un identifiant {nonce}-{signature}, propre à chaque appel', () => {
        const a = issueStagingId('u1');
        expect(a).toMatch(/^[0-9a-f]{24}-[0-9a-f]{32}$/);
        expect(issueStagingId('u1')).not.toBe(a);
    });

    it("n'est valide que pour son déposant", () => {
        const sid = issueStagingId('u1');
        expect(isStagingIdSignedFor(sid, 'u1')).toBe(true);
        expect(isStagingIdSignedFor(sid, 'u2')).toBe(false);
        expect(isStagingIdSignedFor(sid, '')).toBe(false);
    });

    it('refuse une signature altérée, un UUID, une valeur non textuelle', () => {
        const sid = issueStagingId('u1');
        const tampered = `${sid.slice(0, -1)}${sid.endsWith('0') ? '1' : '0'}`;
        expect(isStagingIdSignedFor(tampered, 'u1')).toBe(false);
        expect(isStagingIdSignedFor('0f8fad5b-d9cb-469f-a165-70867728950e', 'u1')).toBe(false);
        expect(isStagingIdSignedFor(null, 'u1')).toBe(false);
    });

    it('dépend du secret : un autre AUTH_SECRET invalide les identifiants émis', () => {
        const sid = issueStagingId('u1');
        vi.stubEnv('AUTH_SECRET', 'autre-secret');
        expect(isStagingIdSignedFor(sid, 'u1')).toBe(false);
    });

    it('sans AUTH_SECRET : lève (jamais de signature vide)', () => {
        vi.stubEnv('AUTH_SECRET', '');
        vi.stubEnv('NEXTAUTH_SECRET', '');
        expect(() => issueStagingId('u1')).toThrow(/AUTH_SECRET/);
    });
});

const rejectedReceiptKeys = (...args: Parameters<typeof normalizeReceiptKeys>) => normalizeReceiptKeys(...args).rejected;

describe('normalizeReceiptKeys', () => {
    const own = () => `expenses-staging/paris-18/${issueStagingId('u1')}/a-ticket.jpg`;
    const opts = { ulSegment: 'paris-18', ownerId: 'u1', storedKeys: [] as string[] };

    it('accepte une clé de dépôt de l\'UL de la note, signée pour son créateur', () => {
        expect(rejectedReceiptKeys([own()], opts)).toEqual([]);
    });

    it("refuse une clé d'une autre UL, d'un autre déposant, non signée ou forgée", () => {
        const sid = issueStagingId('u1');
        const keys = [
            `expenses-staging/paris-17/${sid}/a.jpg`,
            `expenses-staging/paris-18/${issueStagingId('u2')}/a.jpg`,
            'expenses-staging/paris-18/0f8fad5b-d9cb-469f-a165-70867728950e/a.jpg',
            'ndf-revisions/paris-18/x.pdf',
            `expenses-staging/paris-18/${sid}/../x.pdf`,
        ];
        expect(rejectedReceiptKeys(keys, opts)).toEqual(keys);
    });

    it('ancienne clé : acceptée seulement si déjà stockée dans cette note', () => {
        const legacy = 'expenses-staging/s1/ancien.jpg';
        expect(rejectedReceiptKeys([legacy], opts)).toEqual([legacy]);
        expect(rejectedReceiptKeys([legacy], { ...opts, storedKeys: [legacy] })).toEqual([]);
    });

    it('ancienne clé envoyée alors que sa forme rangée est stockée : remplacée par la clé stockée', () => {
        const sid = '0f8fad5b-d9cb-469f-a165-70867728950e';
        const relocated = `expenses-staging/paris-18/${sid}/u-ticket.jpg`;
        const legacy = `expenses-staging/${sid}/u-ticket.jpg`;
        const fresh = own();
        expect(normalizeReceiptKeys([legacy, fresh], { ...opts, storedKeys: [relocated] }))
            .toEqual({ keys: [relocated, fresh], rejected: [] });
        // Les deux formes envoyées ensemble : une seule clé enregistrée.
        expect(normalizeReceiptKeys([relocated, legacy], { ...opts, storedKeys: [relocated] }).keys).toEqual([relocated]);
        // Fichier différent : pas de substitution.
        expect(rejectedReceiptKeys([`expenses-staging/${sid}/autre.jpg`], { ...opts, storedKeys: [relocated] }))
            .toEqual([`expenses-staging/${sid}/autre.jpg`]);
    });

    it('clé stockée forgée : toujours refusée', () => {
        const forged = 'ndf-revisions/paris-18/x.pdf';
        expect(rejectedReceiptKeys([forged], { ...opts, storedKeys: [forged] })).toEqual([forged]);
    });
});

describe('parseStoredReceiptKeys', () => {
    it('lit un tableau JSON de chaînes ; vide ou illisible → []', () => {
        expect(parseStoredReceiptKeys('["a","b",3]')).toEqual(['a', 'b']);
        expect(parseStoredReceiptKeys('pas du json')).toEqual([]);
        expect(parseStoredReceiptKeys(null)).toEqual([]);
        expect(parseStoredReceiptKeys('{"a":1}')).toEqual([]);
    });
});

describe('receiptKeysError', () => {
    it('indique combien de justificatifs ont été refusés, sans prétendre les avoir retirés', () => {
        expect(receiptKeysError(1)).toBe('1 justificatif a été refusé : ajoutez-le de nouveau puis réessayez.');
        expect(receiptKeysError(3)).toBe('3 justificatifs ont été refusés : ajoutez-les de nouveau puis réessayez.');
        expect(receiptKeysError(2)).not.toMatch(/retir/);
    });
});
