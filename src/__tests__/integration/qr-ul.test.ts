/**
 * Tests d'intégration — GET /api/qr-ul/[token].
 *
 * Résolution du token QR d'une UL vers `{ id, name }`, alimentant la page de
 * scan `/qr-ul/[token]`. Aucun filtre d'UL ni de rôle : la possession du QR fait
 * foi, exactement comme pour `/api/qr/[token]/vehicle`. Ce n'est pas un oubli —
 * les cas ci-dessous l'épinglent pour qu'un contributeur ne le « corrige » pas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/qr-ul/[token]/route';
import { DELETE as regenerateToken } from '@/app/api/ul/[id]/qr-token/route';
import { auth } from '@/auth';
import { db, seedUniteLocale } from './setup';

const mockedAuth = vi.mocked(auth);

const TOKEN = 'token-ul-paris-18';

const CHVL = { user: { id: 'u-chvl', email: 'chvl@test.com', name: 'Camille', ulId: 'ul-paris-18', roles: ['CHVL'] } };
const ADMIN = { user: { id: 'u-admin', email: 'admin@test.com', name: 'Alex', ulId: 'ul-paris-18', roles: ['ADMIN'] } };

function makeRequest(token = TOKEN): Request {
    return new Request(`http://localhost/api/qr-ul/${token}`);
}

function withToken(token = TOKEN) {
    return { params: Promise.resolve({ token }) };
}

beforeEach(async () => {
    await db.execute(`DELETE FROM "UniteLocale"`);
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await db.execute({
        sql: `UPDATE "UniteLocale" SET qrToken = ? WHERE id = ?`,
        args: [TOKEN, 'ul-paris-18'],
    });
    mockedAuth.mockReset();
    mockedAuth.mockResolvedValue(CHVL as never);
});

describe('GET /api/qr-ul/[token]', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(makeRequest(), withToken());
        expect(res.status).toBe(401);
    });

    it('retourne 404 pour un token inconnu', async () => {
        const res = await GET(makeRequest('inconnu'), withToken('inconnu'));
        expect(res.status).toBe(404);
        expect((await res.json()).error).toBe('QR Code invalide ou expiré');
    });

    it('retourne 404 quand aucune UL ne porte de token (pas de match sur NULL)', async () => {
        await db.execute(`UPDATE "UniteLocale" SET qrToken = NULL`);
        const res = await GET(makeRequest(), withToken());
        expect(res.status).toBe(404);
    });

    it('résout le token vers `{ id, name }` et rien d\'autre', async () => {
        const res = await GET(makeRequest(), withToken());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: 'ul-paris-18', name: 'Paris 18' });
    });

    it('sert un bénévole rattaché à une AUTRE UL — bypass volontaire', async () => {
        await seedUniteLocale({ id: 'ul-lyon', name: 'Lyon', slug: 'lyon' });
        mockedAuth.mockResolvedValue({ ...CHVL, user: { ...CHVL.user, ulId: 'ul-lyon' } } as never);

        const res = await GET(makeRequest(), withToken());
        expect(res.status).toBe(200);
        expect((await res.json()).id).toBe('ul-paris-18');
    });

    describe('règle d\'accès (isQrBlocked)', () => {
        const cas: Array<[string[], number]> = [
            [['INACTIF'], 403],
            [['GUEST'], 403],
            [['INACTIF', 'CHVL'], 403],
            [['ADMIN', 'INACTIF'], 403],
            [[], 200],
            [['CHVL'], 200],
            [['CHVPSP'], 200],
        ];

        for (const [roles, expected] of cas) {
            it(`roles ${JSON.stringify(roles)} → ${expected}`, async () => {
                mockedAuth.mockResolvedValue({
                    user: { id: 'u-x', email: 'x@test.com', name: 'X', ulId: 'ul-paris-18', roles },
                } as never);

                const res = await GET(makeRequest(), withToken());
                expect(res.status).toBe(expected);
                if (expected === 403) {
                    expect((await res.json()).error).toBe('Compte inactif');
                }
            });
        }
    });
});

describe('régénération du token', () => {
    it('invalide l\'ancien lien : 404 sur la résolution, 200 sur le nouveau', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        const regen = await regenerateToken(
            new Request('http://localhost/api/ul/ul-paris-18/qr-token', { method: 'DELETE' }),
            { params: Promise.resolve({ id: 'ul-paris-18' }) },
        );
        expect(regen.status).toBe(200);
        const { token: nouveau } = await regen.json();

        mockedAuth.mockResolvedValue(CHVL as never);
        expect((await GET(makeRequest(TOKEN), withToken(TOKEN))).status).toBe(404);
        expect((await GET(makeRequest(nouveau), withToken(nouveau))).status).toBe(200);
    });
});
