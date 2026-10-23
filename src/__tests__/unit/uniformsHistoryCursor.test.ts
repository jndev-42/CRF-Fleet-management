import { describe, it, expect, vi } from 'vitest';

// history.ts importe le client DB ; ces tests n'exercent que les helpers de curseur.
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn() } }));

import { encodeCursor, decodeCursor } from '@/lib/uniforms/history';

const b64 = (value: unknown) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').toString('base64url');

describe('encodeCursor / decodeCursor', () => {
    it('aller-retour', () => {
        const cursor = { at: '2026-09-01T08:00:00.000Z', key: 'return:b1:2026-09-01T08:00:00.000Z:l1' };
        expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    });

    it('produit du base64url (ni +, ni /, ni =)', () => {
        const encoded = encodeCursor({ at: '2026-09-01T08:00:00.000Z', key: 'loan:b?>>~' });
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('refuse un base64 invalide ou un contenu qui n\'est pas du JSON', () => {
        expect(decodeCursor('%%%')).toBeNull();
        expect(decodeCursor('')).toBeNull();
        expect(decodeCursor(b64('pas du json'))).toBeNull();
    });

    it('refuse un JSON qui n\'est pas un objet', () => {
        for (const value of [null, 42, 'texte', [1, 2], true]) {
            expect(decodeCursor(b64(JSON.stringify(value))), JSON.stringify(value)).toBeNull();
        }
    });

    it('refuse un champ absent, vide ou mal typé', () => {
        expect(decodeCursor(b64({ key: 'loan:b1' }))).toBeNull();
        expect(decodeCursor(b64({ at: '2026-09-01T08:00:00.000Z' }))).toBeNull();
        expect(decodeCursor(b64({ at: '', key: 'loan:b1' }))).toBeNull();
        expect(decodeCursor(b64({ at: '2026-09-01T08:00:00.000Z', key: '' }))).toBeNull();
        expect(decodeCursor(b64({ at: 1, key: 'loan:b1' }))).toBeNull();
        expect(decodeCursor(b64({ at: '2026-09-01T08:00:00.000Z', key: null }))).toBeNull();
    });

    it('ignore les champs supplémentaires', () => {
        expect(decodeCursor(b64({ at: 'a', key: 'k', extra: 1 }))).toEqual({ at: 'a', key: 'k' });
    });
});
