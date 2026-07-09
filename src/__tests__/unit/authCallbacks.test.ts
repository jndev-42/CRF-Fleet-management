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

            const result = await authCallbacks.jwt({ token, user, trigger: undefined, session: undefined });

            expect(result.originalEmail).toBe('user@croix-rouge.fr');
            expect(result.email).toBe('user@croix-rouge.fr');
            expect(result.userId).toBe('user-id-1');
            expect(result.roles).toContain('CHVL');
        });

        it('should allow jeannoel.durand@croix-rouge.fr to impersonate another user', async () => {
            const token = {
                originalEmail: 'jeannoel.durand@croix-rouge.fr',
                email: 'jeannoel.durand@croix-rouge.fr',
            };

            // Mock DB lookup for target user: id, UL list, and roles
            mockExecute.mockResolvedValueOnce({
                rows: [{ id: 'target-user-id' }]
            }).mockResolvedValueOnce({
                rows: [] // no ULs
            }).mockResolvedValueOnce({
                rows: [{ name: 'CHVL' }, { name: 'RESPO' }]
            });

            const result = await authCallbacks.jwt({
                token,
                user: undefined,
                trigger: 'update',
                session: { impersonateEmail: 'target@croix-rouge.fr' }
            });

            expect(result.impersonatedEmail).toBe('target@croix-rouge.fr');
            expect(result.email).toBe('target@croix-rouge.fr');
            expect(result.userId).toBe('target-user-id');
            expect(result.roles).toContain('CHVL');
            expect(result.roles).toContain('RESPO');
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
                rows: [{ name: 'ADMIN' }]
            });

            const result = await authCallbacks.jwt({
                token,
                user: undefined,
                trigger: 'update',
                session: { impersonateEmail: 'target@croix-rouge.fr' }
            });

            expect(result.impersonatedEmail).toBeUndefined();
            expect(result.email).toBe('other-admin@croix-rouge.fr');
            expect(result.userId).toBe('other-admin-id');
            expect(result.roles).toContain('ADMIN');
        });

        it('should allow jeannoel to stop impersonating', async () => {
            const token = {
                originalEmail: 'jeannoel.durand@croix-rouge.fr',
                impersonatedEmail: 'target@croix-rouge.fr',
                email: 'target@croix-rouge.fr',
            };

            // Mock DB lookup for original user (jeannoel)
            mockExecute.mockResolvedValueOnce({
                rows: [{ id: 'jeannoel-id' }]
            }).mockResolvedValueOnce({
                rows: [] // no ULs
            }).mockResolvedValueOnce({
                rows: [{ name: 'ADMIN' }]
            });

            const result = await authCallbacks.jwt({
                token,
                user: undefined,
                trigger: 'update',
                session: { impersonateEmail: null }
            });

            expect(result.impersonatedEmail).toBeNull();
            expect(result.email).toBe('jeannoel.durand@croix-rouge.fr');
            expect(result.userId).toBe('jeannoel-id');
            expect(result.roles).toContain('ADMIN');
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

            const result = await authCallbacks.session({
                session: session as unknown as Session,
                token: token as unknown as JWT,
            });

            expect(result.user.id).toBe('target-id');
            expect(result.user.originalEmail).toBe('jeannoel.durand@croix-rouge.fr');
            expect(result.user.impersonatedEmail).toBe('target@croix-rouge.fr');
            expect(result.user.roles).toContain('CHVL');
        });
    });
});
