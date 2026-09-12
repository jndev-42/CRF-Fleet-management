/**
 * Test unitaire — AC-J6 : les deux callbacks d'`auth.ts` appellent la MÊME résolution
 * de rôles, avec les mêmes arguments.
 *
 * Fichier séparé de `authCallbacks.test.ts` et de `integration/session-roles.test.ts` :
 * `vi.mock` porte sur tout le fichier, et remplacer `resolveSessionRoles` par un espion
 * priverait ces deux suites de la fonction réelle qu'elles testent. Ici rien ne touche
 * la base — la résolution est mockée de bout en bout, d'où le placement en `unit/`.
 *
 * Ce que ce test garde : les deux callbacks portaient chacun une copie de la cascade,
 * déjà désynchronisées (le callback `session` avait un 3ᵉ repli que `jwt` n'avait pas).
 * Toute correction appliquée à l'une et pas à l'autre produirait un blocage dépendant
 * du chemin de construction de la session.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

vi.mock('next-auth', () => ({
    default: vi.fn(() => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() })),
}));

const mockExecute = vi.fn();
vi.mock('@/lib/db', () => ({
    db: { execute: (arg: { sql: string; args?: unknown[] }) => mockExecute(arg) },
}));

vi.mock('@/lib/session-roles', () => ({
    resolveSessionRoles: vi.fn(async () => ['CHVL', 'INACTIF']),
}));

import { authCallbacks } from '@/auth';
import { resolveSessionRoles } from '@/lib/session-roles';

const mockedResolve = vi.mocked(resolveSessionRoles);

const jwtCallback = authCallbacks.jwt;
const sessionCallback = authCallbacks.session;
if (!jwtCallback || !sessionCallback) {
    throw new Error('authCallbacks.jwt et authCallbacks.session doivent être définis');
}
const jwtFn: NonNullable<typeof authCallbacks.jwt> = jwtCallback;
const sessionFn: NonNullable<typeof authCallbacks.session> = sessionCallback;

beforeEach(() => {
    vi.clearAllMocks();
    mockedResolve.mockResolvedValue(['CHVL', 'INACTIF']);
});

describe('AC-J6 — les deux callbacks partagent resolveSessionRoles', () => {
    it('le callback `session` passe token.userId et token.ulId', async () => {
        const result = await sessionFn({
            session: { user: { email: 'benevole@croix-rouge.fr' }, expires: '9999' } as unknown as Session,
            token: {
                originalEmail: 'benevole@croix-rouge.fr',
                userId: 'user-42',
                ulId: 'ul-marseille',
                roles: ['ADMIN'],
            } as unknown as JWT,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- charge de test partielle : les callbacks n'utilisent pas les autres champs
        } as any) as Session;

        expect(mockedResolve).toHaveBeenCalledTimes(1);
        expect(mockedResolve.mock.calls[0][1]).toBe('user-42');
        expect(mockedResolve.mock.calls[0][2]).toBe('ul-marseille');
        // Et le résultat est bien ce qui atterrit en session, sans retraitement.
        expect(result.user.roles).toEqual(['CHVL', 'INACTIF']);
    });

    it('le callback `jwt` passe les MÊMES arguments', async () => {
        // 1er execute : résolution de l'utilisateur par email. 2e : fetchUserULs.
        mockExecute
            .mockResolvedValueOnce({ rows: [{ id: 'user-42' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'ul-marseille', name: 'Marseille', slug: 'marseille', is_home: 1, roles: 'CHVL' }] });

        const result = await jwtFn({
            token: { originalEmail: 'benevole@croix-rouge.fr', email: 'benevole@croix-rouge.fr' },
            user: undefined,
            trigger: undefined,
            session: undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- charge de test partielle
        } as any) as JWT;

        expect(mockedResolve).toHaveBeenCalledTimes(1);
        expect(mockedResolve.mock.calls[0][1]).toBe('user-42');
        expect(mockedResolve.mock.calls[0][2]).toBe('ul-marseille');
        expect(result.roles).toEqual(['CHVL', 'INACTIF']);
    });
});
