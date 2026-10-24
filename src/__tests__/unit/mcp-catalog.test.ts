/**
 * Catalogue des routes du serveur MCP : synchronisé avec `src/app/api`, exclusions
 * appliquées, résolution d'un chemin concret comme Next.js la ferait.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CATALOG_FILE, buildCatalog, exportedMethods, renderCatalogSource } from '@/lib/mcp/catalog-build';
import { MCP_API_CATALOG } from '@/lib/mcp/catalog.generated';
import { findCatalogRoute, isExcludedApiPath, normalizeApiPath, type CatalogRoute } from '@/lib/mcp/routes';

describe('catalogue généré', () => {
    it('est synchronisé avec le système de fichiers (sinon : npm run mcp:catalog)', () => {
        const onDisk = readFileSync(join(process.cwd(), CATALOG_FILE), 'utf8');
        expect(onDisk).toBe(renderCatalogSource(buildCatalog()));
    });

    it('contient les routes métier et aucune route exclue', () => {
        const paths = MCP_API_CATALOG.map(r => r.path);
        expect(paths.length).toBeGreaterThan(100);
        expect(MCP_API_CATALOG.find(r => r.path === '/api/vehicles/[id]')?.methods).toEqual(['GET', 'PATCH', 'DELETE']);
        expect(paths.filter(p => /^\/api\/(auth|cron|mcp|mcp-tokens)(\/|$)/.test(p))).toEqual([]);
    });
});

describe('exportedMethods', () => {
    it('reconnaît les fonctions, constantes et ré-exports', () => {
        expect(exportedMethods('export async function GET() {}\nexport const PATCH = withAudit(h, {});')).toEqual(['GET', 'PATCH']);
        expect(exportedMethods('export { handler as GET, handler as POST };')).toEqual(['GET', 'POST']);
        expect(exportedMethods('export { DELETE };')).toEqual(['DELETE']);
        expect(exportedMethods('async function GET() {}\nexport const dynamic = "force-dynamic";')).toEqual([]);
    });
});

describe('isExcludedApiPath', () => {
    it('exclut auth, cron, mcp et mcp-tokens, préfixe compris', () => {
        for (const path of ['/api/auth/session', '/api/cron/daily-alerts', '/api/mcp', '/api/mcp-tokens', '/api/mcp-tokens/abc']) {
            expect(isExcludedApiPath(path)).toBe(true);
        }
        for (const path of ['/api/vehicles', '/api/authors', '/api/mcpx']) {
            expect(isExcludedApiPath(path)).toBe(false);
        }
    });
});

describe('normalizeApiPath', () => {
    it('accepte un chemin concret sous /api/ (barre finale retirée)', () => {
        expect(normalizeApiPath('/api/vehicles')).toBe('/api/vehicles');
        expect(normalizeApiPath('/api/vehicles/VL186/')).toBe('/api/vehicles/VL186');
        expect(normalizeApiPath('/api/users/a%40croix-rouge.fr/ul')).toBe('/api/users/a%40croix-rouge.fr/ul');
    });

    it('refuse les chemins hors /api/, les traversées et les paramètres non résolus', () => {
        for (const path of [
            '', '/', '/api', 'api/vehicles', 'https://evil.example/api/x', '/login', '/api/../auth/session',
            '/api/vehicles/%2e%2e/x', '/api/vehicles/a%2Fb', '/api//vehicles', '/api/vehicles/[id]',
            '/api/vehicles?x=1', '/api/vehicles#x', '/api/vehicles\\x', '/api/vehicles/%E0%A4%A',
        ]) {
            expect(normalizeApiPath(path)).toBeNull();
        }
    });
});

describe('findCatalogRoute', () => {
    const catalog: CatalogRoute[] = [
        { path: '/api/vehicles', methods: ['GET', 'POST'] },
        { path: '/api/vehicles/[id]', methods: ['GET', 'PATCH'] },
        { path: '/api/vehicles/import', methods: ['POST'] },
        { path: '/api/files/[...key]', methods: ['GET'] },
        { path: '/api/cron/daily-alerts', methods: ['GET'] },
    ];

    it('préfère un segment statique à un segment dynamique', () => {
        expect(findCatalogRoute('/api/vehicles/import', catalog)?.path).toBe('/api/vehicles/import');
        expect(findCatalogRoute('/api/vehicles/VL186', catalog)?.path).toBe('/api/vehicles/[id]');
        expect(findCatalogRoute('/api/vehicles', catalog)?.path).toBe('/api/vehicles');
    });

    it('gère les segments attrape-tout', () => {
        expect(findCatalogRoute('/api/files/a/b/c', catalog)?.path).toBe('/api/files/[...key]');
        expect(findCatalogRoute('/api/files', catalog)).toBeNull();
    });

    it('refuse un chemin inconnu ou exclu, même présent dans le catalogue', () => {
        expect(findCatalogRoute('/api/vehicles/VL186/extra', catalog)).toBeNull();
        expect(findCatalogRoute('/api/cron/daily-alerts', catalog)).toBeNull();
    });
});
