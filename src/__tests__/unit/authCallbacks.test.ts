import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

// Mock next-auth to avoid next/server import crash
vi.mock('next-auth', () => {
    return {
        default: vi.fn(() => ({
            handlers: {},
            signIn: vi.fn(),
            signOut: vi.fn(),
            auth: vi.fn(),
        })),
    };
});

// Mock DB
const mockExecute = vi.fn();
vi.mock('@/lib/db', () => ({
    db: {
        execute: (arg: { sql: string; args?: unknown[] }) => mockExecute(arg),
    },
}));

import { authCallbacks } from '@/auth';

// `NextAuthConfig["callbacks"]` déclare `jwt` et `session` optionnels, et `jwt` peut
// renvoyer `null`. On fige les références une fois pour toutes et on centralise ici la
// conversion des charges de test partielles, plutôt que de la répéter à chaque appel.
const jwtCallback = authCallbacks.jwt;
const sessionCallback = authCallbacks.session;
if (!jwtCallback || !sessionCallback) {
    throw new Error('authCallbacks.jwt et authCallbacks.session doivent être définis');
}
// Références au type non optionnel : le rétrécissement ci-dessus ne traverse pas les
// frontières de fonction, les helpers ci-dessous s'appuient donc sur ces alias typés.
const jwtFn: NonNullable<typeof authCallbacks.jwt> = jwtCallback;
const sessionFn: NonNullable<typeof authCallbacks.session> = sessionCallback;

type JwtArgs = Parameters<typeof jwtFn>[0];
type SessionArgs = Parameters<typeof sessionFn>[0];

/** Appelle le callback `jwt` et garantit un retour non nul. */
async function callJwt(args: {
    token: Record<string, unknown>;
    user?: unknown;
    trigger?: 'signIn' | 'signUp' | 'update';
    session?: unknown;
}): Promise<JWT> {
    const result = await jwtFn(args as unknown as JwtArgs);
    if (!result) throw new Error('Le callback jwt a renvoyé null');
    return result;
}

/** Appelle le callback `session` et restreint le retour élargi de next-auth à `Session`. */
async function callSession(args: { session: Session; token: JWT }): Promise<Session> {
    return (await sessionFn(args as unknown as SessionArgs)) as Session;
}

describe('NextAuth Callbacks — Impersonation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('jwt callback', () => {
        it('should set originalEmail on first sign in', async () => {
            const token = {};
            const user = { email: 'user@croix-rouge.fr' };

            // Mock DB lookup for user id, UL list, and roles
            mockExecute.mockResolvedValueOnce({
                rows: [{ id: 'user-id-1' }]
            }).mockResolvedValueOnce({
                rows: [] // no ULs
            }).mockResolvedValueOnce({
                rows: [{ name: 'CHVL' }]
            });

            const result = await callJwt({ token, user, trigger: undefined, session: undefined });

            expect(result.originalEmail).toBe('user@croix-rouge.fr');
            expect(result.email).toBe('user@croix-rouge.fr');
            expect(result.userId).toBe('user-id-1');
            expect(result.roles).toContain('CHVL');
        });

        it('should allow jeannoel.durand@croix-rouge.fr to impersonate another user and switch active ulId', async () => {
            const token = {
                originalEmail: 'jeannoel.durand@croix-rouge.fr',
                email: 'jeannoel.durand@croix-rouge.fr',
                ulId: 'ul-paris-18', // Active UL prior to impersonation
            };

            // Mock DB lookup for target user: id, UL list (UL Paris 17), and roles
            mockExecute.mockResolvedValueOnce({
                rows: [{ id: 'target-user-id' }]
            }).mockResolvedValueOnce({
                rows: [{ id: 'ul-paris-17', name: 'UL Paris 17', slug: 'paris-17', is_home: 1, roles: 'CHVL' }]
            }).mockResolvedValueOnce({
                rows: [{ name: 'CHVL' }]
            }).mockResolvedValueOnce({
                rows: [{ roles: 'CHVL' }]
            });

            const result = await callJwt({
                token,
                user: undefined,
                trigger: 'update',
                session: { impersonateEmail: 'target@croix-rouge.fr' }
            });

            expect(result.impersonatedEmail).toBe('target@croix-rouge.fr');
            expect(result.email).toBe('target@croix-rouge.fr');
            expect(result.userId).toBe('target-user-id');
            expect(result.ulId).toBe('ul-paris-17');
            expect(result.roles).toContain('CHVL');
        });

        it('should NOT allow other users to impersonate', async () => {
            const token = {
                originalEmail: 'other-admin@croix-rouge.fr',
                email: 'other-admin@croix-rouge.fr',
            };

            // Mock DB lookup for original user
            mockExecute.mockResolvedValueOnce({
                rows: [{ id: 'other-admin-id' }]
            }).mockResolvedValueOnce({
                rows: [] // no ULs
            }).mockResolvedValueOnce({
                rows: [{ name: 'SUPER_ADMIN' }]
            });

            const result = await callJwt({
                token,
                user: undefined,
                trigger: 'update',
                session: { impersonateEmail: 'target@croix-rouge.fr' }
            });

            expect(result.impersonatedEmail).toBeUndefined();
            expect(result.email).toBe('other-admin@croix-rouge.fr');
            expect(result.userId).toBe('other-admin-id');
            expect(result.roles).toContain('SUPER_ADMIN');
        });

        it('should allow jeannoel to stop impersonating and restore original home ulId', async () => {
            const token = {
                originalEmail: 'jeannoel.durand@croix-rouge.fr',
                impersonatedEmail: 'target@croix-rouge.fr',
                email: 'target@croix-rouge.fr',
                ulId: 'ul-paris-17', // Active UL during impersonation
            };

            // Mock DB lookup for original user (jeannoel)
            mockExecute.mockResolvedValueOnce({
                rows: [{ id: 'jeannoel-id' }]
            }).mockResolvedValueOnce({
                rows: [{ id: 'ul-paris-18', name: 'UL Paris 18', slug: 'paris-18', is_home: 1, roles: 'SUPER_ADMIN' }]
            }).mockResolvedValueOnce({
                rows: [{ name: 'SUPER_ADMIN' }]
            }).mockResolvedValueOnce({
                rows: [{ roles: 'SUPER_ADMIN' }]
            });

            const result = await callJwt({
                token,
                user: undefined,
                trigger: 'update',
                session: { impersonateEmail: null }
            });

            expect(result.impersonatedEmail).toBeNull();
            expect(result.email).toBe('jeannoel.durand@croix-rouge.fr');
            expect(result.userId).toBe('jeannoel-id');
            expect(result.ulId).toBe('ul-paris-18');
            expect(result.roles).toContain('SUPER_ADMIN');
        });
    });

    describe('session callback', () => {
        it('should propagate originalEmail and impersonatedEmail from token to session', async () => {
            const session = {
                user: {
                    email: 'target@croix-rouge.fr',
                },
                expires: '9999',
            };
            const token = {
                originalEmail: 'jeannoel.durand@croix-rouge.fr',
                impersonatedEmail: 'target@croix-rouge.fr',
                userId: 'target-id',
                roles: ['CHVL'],
            };

            const result = await callSession({
                session: session as unknown as Session,
                token: token as unknown as JWT,
            });

            expect(result.user.id).toBe('target-id');
            expect(result.user.originalEmail).toBe('jeannoel.durand@croix-rouge.fr');
            expect(result.user.impersonatedEmail).toBe('target@croix-rouge.fr');
            expect(result.user.roles).toContain('CHVL');
        });
    });

    describe('signIn callback — Auto-création de compte', () => {
        it('should auto-create a user in DB if email is @croix-rouge.fr and user does not exist', async () => {
            const user = { email: 'nouveau.benevole@croix-rouge.fr', name: 'Nouveau Bénévoles' };
            const account = { provider: 'google' };

            // Mock user query returning no rows (user does not exist)
            mockExecute.mockResolvedValueOnce({ rows: [] }); // SELECT
            mockExecute.mockResolvedValueOnce({ rows: [] }); // INSERT

            const result = await authCallbacks.signIn!({
                user: user as unknown as Parameters<NonNullable<typeof authCallbacks.signIn>>[0]['user'],
                account: account as unknown as Parameters<NonNullable<typeof authCallbacks.signIn>>[0]['account'],
                profile: undefined,
                email: undefined,
                credentials: undefined,
            });

            expect(result).toBe(true);
            expect(mockExecute).toHaveBeenCalledTimes(2);
            expect(mockExecute.mock.calls[0][0].sql).toContain('SELECT id FROM "User" WHERE email = ?');
            expect(mockExecute.mock.calls[0][0].args).toEqual(['nouveau.benevole@croix-rouge.fr']);
            expect(mockExecute.mock.calls[1][0].sql).toContain('INSERT INTO "User" (id, email, name)');
            expect(mockExecute.mock.calls[1][0].args[1]).toBe('nouveau.benevole@croix-rouge.fr');
            expect(mockExecute.mock.calls[1][0].args[2]).toBe('Nouveau Bénévoles');
        });

        it('should allow sign in without inserting if user already exists', async () => {
            const user = { email: 'existant@croix-rouge.fr', name: 'User Existant' };
            const account = { provider: 'google' };

            // Mock user query returning existing user row
            mockExecute.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

            const result = await authCallbacks.signIn!({
                user: user as unknown as Parameters<NonNullable<typeof authCallbacks.signIn>>[0]['user'],
                account: account as unknown as Parameters<NonNullable<typeof authCallbacks.signIn>>[0]['account'],
                profile: undefined,
                email: undefined,
                credentials: undefined,
            });

            expect(result).toBe(true);
            expect(mockExecute).toHaveBeenCalledTimes(1);
            expect(mockExecute.mock.calls[0][0].sql).toContain('SELECT id FROM "User" WHERE email = ?');
        });

        it('should deny sign in if email is not @croix-rouge.fr', async () => {
            const user = { email: 'externe@gmail.com', name: 'Externe' };
            const account = { provider: 'google' };

            const result = await authCallbacks.signIn!({
                user: user as unknown as Parameters<NonNullable<typeof authCallbacks.signIn>>[0]['user'],
                account: account as unknown as Parameters<NonNullable<typeof authCallbacks.signIn>>[0]['account'],
                profile: undefined,
                email: undefined,
                credentials: undefined,
            });

            expect(result).toBe('/login?error=AccessDenied');
            expect(mockExecute).not.toHaveBeenCalled();
        });

        it('should allow dev-credentials without checking email domain or DB', async () => {
            const account = { provider: 'dev-credentials' };

            const result = await authCallbacks.signIn!({
                user: { email: 'admin@dev.local' } as unknown as Parameters<NonNullable<typeof authCallbacks.signIn>>[0]['user'],
                account: account as unknown as Parameters<NonNullable<typeof authCallbacks.signIn>>[0]['account'],
                profile: undefined,
                email: undefined,
                credentials: undefined,
            });

            expect(result).toBe(true);
            expect(mockExecute).not.toHaveBeenCalled();
        });
    });
});
