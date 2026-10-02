/**
 * `authEvents.signIn` — la connexion réussie est tracée dans le journal d'audit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next-auth', () => ({
    default: vi.fn(() => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() })),
}));
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn() } }));
vi.mock('@/lib/audit/log', () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '198.51.100.4', 'user-agent': 'Firefox' })),
}));

import { authEvents } from '@/auth';
import { recordAudit } from '@/lib/audit/log';
import { headers } from 'next/headers';
import NextAuth from 'next-auth';

type SignInMessage = Parameters<NonNullable<typeof authEvents.signIn>>[0];

beforeEach(() => {
    vi.mocked(recordAudit).mockClear();
});

describe('authEvents.signIn', () => {
    it('est branché sur NextAuth', () => {
        expect(NextAuth).toHaveBeenCalledWith(expect.objectContaining({ events: authEvents }));
    });

    it('trace la connexion avec auteur, fournisseur, IP et navigateur', async () => {
        await authEvents.signIn!({
            user: { email: 'jean@croix-rouge.fr', name: 'Jean' },
            account: { provider: 'google', type: 'oidc', providerAccountId: '1' },
        } as SignInMessage);

        expect(recordAudit).toHaveBeenCalledWith({
            actorEmail: 'jean@croix-rouge.fr',
            actorName: 'Jean',
            method: 'POST',
            path: '/api/auth/callback/google',
            action: 'Connexion',
            entityType: 'session',
            entityId: 'google',
            status: 200,
            ip: '198.51.100.4',
            userAgent: 'Firefox',
        });
    });

    it('trace même hors contexte de requête (sans IP ni navigateur)', async () => {
        vi.mocked(headers).mockRejectedValueOnce(new Error('outside request scope'));
        await authEvents.signIn!({
            user: { email: 'jean@croix-rouge.fr', name: null },
            account: null,
        } as SignInMessage);

        expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
            actorEmail: 'jean@croix-rouge.fr', path: '/api/auth/callback/inconnu', ip: null, userAgent: null,
        }));
    });
});
