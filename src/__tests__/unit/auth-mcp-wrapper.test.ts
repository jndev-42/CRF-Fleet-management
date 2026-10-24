/**
 * Enveloppe `auth()` de `src/auth.ts` : une assertion MCP valide donne la session du
 * propriétaire du jeton ; sinon délégation à NextAuth. Avec arguments, délégation pure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const nextAuthAuth = vi.hoisted(() => vi.fn());
const requestHeaders = vi.hoisted(() => ({ current: new Headers() as Headers | null }));

vi.mock('next-auth', () => ({
    default: vi.fn(() => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: nextAuthAuth })),
}));
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn() } }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => {
        if (!requestHeaders.current) throw new Error('hors contexte de requête');
        return requestHeaders.current;
    }),
}));
vi.mock('@/lib/mcp/tokens', () => ({ loadMcpPrincipal: vi.fn() }));

import { auth } from '@/auth';
import { MCP_ASSERTION_HEADER, signMcpAssertion } from '@/lib/mcp/assertion';
import { loadMcpPrincipal, type McpPrincipal } from '@/lib/mcp/tokens';

const mockedLoad = vi.mocked(loadMcpPrincipal);
const callAuth = auth as unknown as (...args: unknown[]) => Promise<unknown>;

const principal: McpPrincipal = {
    tokenId: 'tok-1',
    tokenName: 'Claude bureau',
    scope: 'write',
    expiresAt: '2027-01-01T00:00:00.000Z',
    userId: 'u-1',
    email: 'admin@croix-rouge.fr',
    name: 'Admin',
    roles: ['ADMIN'],
    ulId: 'ul-1',
    availableULs: [{ id: 'ul-1', name: 'Paris 18', slug: 'paris-18', isHome: true, dtCode: 'DT75' }],
};

const cookieSession = { user: { id: 'u-web', email: 'web@croix-rouge.fr', roles: ['CHVL'] } };
let savedSecret: string | undefined;

function withAssertion(value: string) {
    requestHeaders.current = new Headers({ [MCP_ASSERTION_HEADER]: value });
}

beforeEach(() => {
    savedSecret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'secret-de-test';
    nextAuthAuth.mockReset();
    nextAuthAuth.mockResolvedValue(cookieSession);
    mockedLoad.mockReset();
    mockedLoad.mockResolvedValue(principal);
    requestHeaders.current = new Headers();
});

afterEach(() => {
    if (savedSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = savedSecret;
});

describe('auth() — appels du serveur MCP', () => {
    it("assertion valide : session du propriétaire, rôles relus, marque MCP", async () => {
        withAssertion(signMcpAssertion({ userId: 'u-1', tokenId: 'tok-1', scope: 'write' }, 'PATCH'));
        const session = await callAuth() as { user: Record<string, unknown> };

        expect(mockedLoad).toHaveBeenCalledWith('tok-1', 'u-1');
        expect(nextAuthAuth).not.toHaveBeenCalled();
        expect(session.user).toMatchObject({
            id: 'u-1',
            email: 'admin@croix-rouge.fr',
            originalEmail: 'admin@croix-rouge.fr',
            roles: ['ADMIN'],
            ulId: 'ul-1',
            mcpTokenId: 'tok-1',
            mcpTokenName: 'Claude bureau',
            mcpScope: 'write',
        });
        expect(session.user.availableULs).toEqual([{ id: 'ul-1', name: 'Paris 18', slug: 'paris-18', isHome: true, roles: undefined }]);
    });

    it('sans en-tête : délègue à NextAuth (cookie de session)', async () => {
        expect(await callAuth()).toBe(cookieSession);
        expect(mockedLoad).not.toHaveBeenCalled();
    });

    it('assertion falsifiée : délègue à NextAuth, aucun accès base', async () => {
        withAssertion('Zm9v.YmFy');
        expect(await callAuth()).toBe(cookieSession);
        expect(mockedLoad).not.toHaveBeenCalled();
    });

    it('jeton révoqué ou propriétaire rétrogradé : pas de session MCP', async () => {
        mockedLoad.mockResolvedValue(null);
        nextAuthAuth.mockResolvedValue(null);
        withAssertion(signMcpAssertion({ userId: 'u-1', tokenId: 'tok-1', scope: 'read' }, 'GET'));
        expect(await callAuth()).toBeNull();
    });

    it('le jeton brut en Bearer n\'est pas reconnu hors de /api/mcp', async () => {
        nextAuthAuth.mockResolvedValue(null);
        requestHeaders.current = new Headers({ authorization: `Bearer crf_mcp_${'a'.repeat(43)}` });
        expect(await callAuth()).toBeNull();
        expect(mockedLoad).not.toHaveBeenCalled();
    });

    it('hors contexte de requête : délègue à NextAuth', async () => {
        requestHeaders.current = null;
        expect(await callAuth()).toBe(cookieSession);
    });

    it('avec arguments : délégation pure, sans lire les en-têtes', async () => {
        withAssertion(signMcpAssertion({ userId: 'u-1', tokenId: 'tok-1', scope: 'write' }, 'GET'));
        const handler = () => undefined;
        await callAuth(handler);
        expect(nextAuthAuth).toHaveBeenCalledWith(handler);
        expect(mockedLoad).not.toHaveBeenCalled();
    });
});
