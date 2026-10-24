/**
 * Fonctions pures des outils MCP (`src/lib/mcp/tools.ts`). Le parcours complet de
 * `api_request` est couvert par `integration/mcp-server.test.ts`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiRequest, internalOrigin, listApiRoutes, mcpUserAgent } from '@/lib/mcp/tools';
import type { McpPrincipal } from '@/lib/mcp/tokens';

const principal: McpPrincipal = {
    tokenId: 't', tokenName: 'Claude', scope: 'read', expiresAt: '2099-01-01T00:00:00.000Z',
    userId: 'u', email: 'a@croix-rouge.fr', name: 'A', roles: ['ADMIN'], ulId: 'ul', availableULs: [],
};

describe('mcpUserAgent', () => {
    it('CRF-MCP/<nom du jeton>, en ASCII imprimable', () => {
        expect(mcpUserAgent('Claude bureau')).toBe('CRF-MCP/Claude bureau');
        expect(mcpUserAgent('Équipe Réservations')).toBe('CRF-MCP/Equipe Reservations');
        expect(mcpUserAgent('IA 🤖\n')).toBe('CRF-MCP/IA __');
        expect(mcpUserAgent('   ')).toBe('CRF-MCP/jeton');
        expect(() => new Headers({ 'user-agent': mcpUserAgent('Émoji 🚑 « test »') })).not.toThrow();
    });
});

describe('listApiRoutes', () => {
    const catalog = [
        { path: '/api/vehicles', methods: ['GET', 'POST'] as const },
        { path: '/api/trips', methods: ['GET'] as const },
    ];

    it('filtre sur le chemin, sans tenir compte de la casse', () => {
        const text = listApiRoutes(principal, 'VEHIC', catalog).content[0].text;
        expect(text).toContain('/api/vehicles');
        expect(text).not.toContain('/api/trips');
    });

    it('signale la lecture seule et un filtre sans résultat', () => {
        expect(listApiRoutes(principal, undefined, catalog).content[0].text).toMatch(/lecture seule/);
        expect(listApiRoutes({ ...principal, scope: 'write' }, undefined, catalog).content[0].text).not.toMatch(/lecture seule/);
        expect(listApiRoutes(principal, 'zzz', catalog).content[0].text).toBe('Aucune route ne correspond à ce filtre.');
    });
});

describe('internalOrigin', () => {
    const forged = new Request('http://evil.example/api/mcp', { headers: { host: 'evil.example' } });

    it("préfère l'environnement à l'hôte de la requête", () => {
        expect(internalOrigin(forged, { MCP_INTERNAL_ORIGIN: 'https://interne.example' })).toBe('https://interne.example');
        expect(internalOrigin(forged, { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'flotte.example', VERCEL_URL: 'flotte-abc.vercel.app' }))
            .toBe('https://flotte.example');
        expect(internalOrigin(forged, { VERCEL_ENV: 'preview', VERCEL_PROJECT_PRODUCTION_URL: 'flotte.example', VERCEL_URL: 'flotte-abc.vercel.app' }))
            .toBe('https://flotte-abc.vercel.app');
    });

    it("ne retient l'origine de la requête qu'en dernier recours (dev local)", () => {
        expect(internalOrigin(new Request('http://localhost:3000/api/mcp'), {})).toBe('http://localhost:3000');
    });
});

describe('apiRequest — appel interne', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    function stubSecrets(bypass?: string) {
        vi.stubEnv('AUTH_SECRET', 'secret-de-test');
        if (bypass) vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', bypass);
        else vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', '');
    }

    it('ajoute le contournement de la protection Vercel quand le secret est défini', async () => {
        stubSecrets('bypass-123');
        const fetchImpl = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
        await apiRequest(principal, { method: 'GET', path: '/api/vehicles' }, 'https://x.example', fetchImpl as unknown as typeof fetch);
        const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
        expect(new Headers(init.headers).get('x-vercel-protection-bypass')).toBe('bypass-123');
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it("sans secret, pas d'en-tête de contournement", async () => {
        stubSecrets();
        const fetchImpl = vi.fn(async () => new Response('{}'));
        await apiRequest(principal, { method: 'GET', path: '/api/vehicles' }, 'https://x.example', fetchImpl as unknown as typeof fetch);
        const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
        expect(new Headers(init.headers).has('x-vercel-protection-bypass')).toBe(false);
    });

    it('route trop lente : erreur outil « Délai dépassé »', async () => {
        stubSecrets();
        const fetchImpl = vi.fn(async () => { throw new DOMException('signal timed out', 'TimeoutError'); });
        const result = await apiRequest(principal, { method: 'GET', path: '/api/vehicles' }, 'https://x.example', fetchImpl as unknown as typeof fetch);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/^Délai dépassé/);
    });
});
