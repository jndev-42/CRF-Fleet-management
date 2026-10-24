/**
 * Routes de gestion des jetons MCP : GET/POST /api/mcp-tokens, DELETE /api/mcp-tokens/[id].
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET, POST } from '@/app/api/mcp-tokens/route';
import { DELETE } from '@/app/api/mcp-tokens/[id]/route';
import { createMcpToken, hashToken, MAX_ACTIVE_MCP_TOKENS } from '@/lib/mcp/tokens';
import { db, seedRoles, seedUniteLocale, seedUser, seedUserRole, seedUserUL } from './setup';

const mockedAuth = vi.mocked(auth as unknown as () => Promise<unknown>);

function sessionOf(id: string, roles: string[], extra: Record<string, unknown> = {}) {
    return { user: { id, email: `${id}@croix-rouge.fr`, originalEmail: `${id}@croix-rouge.fr`, name: id, roles, ulId: 'ul-paris-18', ...extra } };
}

function post(body: unknown) {
    return POST(new Request('http://localhost/api/mcp-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    }));
}

function del(id: string) {
    return DELETE(new Request(`http://localhost/api/mcp-tokens/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });
}

async function seedAccount(id: string, role: string) {
    await seedUser({ id, email: `${id}@croix-rouge.fr`, name: id });
    await seedUserRole(id, role);
    await seedUserUL({ userId: id, ulId: 'ul-paris-18', isHome: true });
}

beforeEach(async () => {
    mockedAuth.mockReset();
    await seedRoles();
    await seedUniteLocale();
    await seedAccount('u-admin', 'ADMIN');
    await seedAccount('u-other', 'ADMIN');
    await seedAccount('u-super', 'SUPER_ADMIN');
});

describe('401 — sans session', () => {
    it('GET, POST et DELETE', async () => {
        mockedAuth.mockResolvedValue(null);
        expect((await GET()).status).toBe(401);
        expect((await post({ name: 'x', scope: 'read' })).status).toBe(401);
        expect((await del('x')).status).toBe(401);
    });
});

describe('403 — rôle insuffisant', () => {
    it.each([['CHVL'], ['PRESIDENT'], ['ADMIN', 'INACTIF']])('%s', async (...roles) => {
        mockedAuth.mockResolvedValue(sessionOf('u-admin', roles));
        expect((await GET()).status).toBe(403);
        expect((await post({ name: 'x', scope: 'read' })).status).toBe(403);
        expect((await del('x')).status).toBe(403);
    });

    it('une session MCP (IA) ne gère pas les jetons', async () => {
        mockedAuth.mockResolvedValue(sessionOf('u-admin', ['ADMIN'], { mcpTokenId: 'tok', mcpTokenName: 'IA' }));
        expect((await GET()).status).toBe(403);
        expect((await post({ name: 'x', scope: 'write' })).status).toBe(403);
        expect((await del('x')).status).toBe(403);
    });

    it("pas de jeton généré pendant une impersonation (jamais au nom d'un autre)", async () => {
        mockedAuth.mockResolvedValue(sessionOf('u-admin', ['ADMIN'], { originalEmail: 'u-super@croix-rouge.fr' }));
        expect((await post({ name: 'x', scope: 'read' })).status).toBe(403);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "McpToken"`)).rows[0].n).toBe(0);
    });
});

describe('POST /api/mcp-tokens', () => {
    beforeEach(() => {
        mockedAuth.mockResolvedValue(sessionOf('u-admin', ['ADMIN']));
    });

    it.each([
        ['nom absent', { scope: 'read' }],
        ['nom vide', { name: '   ', scope: 'read' }],
        ['nom trop long', { name: 'x'.repeat(61), scope: 'read' }],
        ['portée inconnue', { name: 'x', scope: 'admin' }],
        ['validité hors liste', { name: 'x', scope: 'read', validityDays: 7 }],
        ['validité illimitée', { name: 'x', scope: 'read', validityDays: null }],
    ])('400 — %s', async (_label, body) => {
        expect((await post(body)).status).toBe(400);
    });

    it('400 — corps illisible', async () => {
        expect((await post('{pas du json')).status).toBe(400);
    });

    it("201 — jeton affiché une fois, seule l'empreinte stockée, pour soi-même, 90 jours par défaut", async () => {
        const res = await post({ name: ' Claude bureau ', scope: 'write', userId: 'u-other' });
        expect(res.status).toBe(201);
        expect(res.headers.get('cache-control')).toBe('no-store');
        const body = await res.json() as { token: string; item: Record<string, unknown> };
        expect(body.token).toMatch(/^crf_mcp_[A-Za-z0-9_-]{43}$/);
        expect(body.item).toMatchObject({ name: 'Claude bureau', scope: 'write', userId: 'u-admin', mine: true, tokenPrefix: body.token.slice(0, 12) });
        expect(JSON.stringify(body.item)).not.toContain(body.token);

        const row = (await db.execute(`SELECT * FROM "McpToken"`)).rows[0];
        expect(row.userId).toBe('u-admin');
        expect(row.tokenHash).toBe(hashToken(body.token));
        const days = (Date.parse(String(row.expiresAt)) - Date.parse(String(row.createdAt))) / (24 * 3600 * 1000);
        expect(days).toBe(90);
    });

    it.each([30, 90, 365])('201 — validité de %i jours', async (validityDays) => {
        const body = await (await post({ name: 'x', scope: 'read', validityDays })).json() as { item: { createdAt: string; expiresAt: string } };
        expect((Date.parse(body.item.expiresAt) - Date.parse(body.item.createdAt)) / (24 * 3600 * 1000)).toBe(validityDays);
    });

    it(`409 — au-delà de ${MAX_ACTIVE_MCP_TOKENS} jetons actifs`, async () => {
        for (let i = 0; i < MAX_ACTIVE_MCP_TOKENS; i++) {
            await createMcpToken({ userId: 'u-admin', name: `t${i}`, scope: 'read', validityDays: 90 });
        }
        const res = await post({ name: 'trop', scope: 'read' });
        expect(res.status).toBe(409);
        expect((await res.json()).error).toMatch(/10/);
    });
});

describe('GET /api/mcp-tokens', () => {
    beforeEach(async () => {
        await createMcpToken({ userId: 'u-admin', name: 'A', scope: 'read', validityDays: 90 });
        await createMcpToken({ userId: 'u-other', name: 'B', scope: 'write', validityDays: 90 });
    });

    it("un ADMIN ne voit que ses jetons, sans empreinte", async () => {
        mockedAuth.mockResolvedValue(sessionOf('u-admin', ['ADMIN']));
        const body = await (await GET()).json() as { tokens: Record<string, unknown>[] };
        expect(body.tokens.map(t => t.name)).toEqual(['A']);
        expect(body.tokens[0]).toMatchObject({ mine: true });
        expect(body.tokens[0]).not.toHaveProperty('tokenHash');
    });

    it('un SUPER_ADMIN voit tous les jetons et leur propriétaire', async () => {
        mockedAuth.mockResolvedValue(sessionOf('u-super', ['SUPER_ADMIN']));
        const body = await (await GET()).json() as { tokens: Record<string, unknown>[] };
        expect(body.tokens.map(t => [t.name, t.userEmail, t.mine]).sort()).toEqual([
            ['A', 'u-admin@croix-rouge.fr', false],
            ['B', 'u-other@croix-rouge.fr', false],
        ]);
    });
});

describe('DELETE /api/mcp-tokens/[id]', () => {
    it('un ADMIN révoque son jeton (idempotent)', async () => {
        const { info } = await createMcpToken({ userId: 'u-admin', name: 'A', scope: 'read', validityDays: 90 });
        mockedAuth.mockResolvedValue(sessionOf('u-admin', ['ADMIN']));
        expect((await del(info.id)).status).toBe(200);
        const revokedAt = (await db.execute({ sql: `SELECT revokedAt FROM "McpToken" WHERE id = ?`, args: [info.id] })).rows[0].revokedAt;
        expect(revokedAt).toBeTruthy();
        expect((await del(info.id)).status).toBe(200);
    });

    it("404 — un ADMIN ne révoque pas le jeton d'un autre, ni un id inconnu", async () => {
        const { info } = await createMcpToken({ userId: 'u-other', name: 'B', scope: 'read', validityDays: 90 });
        mockedAuth.mockResolvedValue(sessionOf('u-admin', ['ADMIN']));
        expect((await del(info.id)).status).toBe(404);
        expect((await del('inconnu')).status).toBe(404);
        expect((await db.execute({ sql: `SELECT revokedAt FROM "McpToken" WHERE id = ?`, args: [info.id] })).rows[0].revokedAt).toBeNull();
    });

    it('un SUPER_ADMIN révoque tous les jetons', async () => {
        const { info } = await createMcpToken({ userId: 'u-other', name: 'B', scope: 'read', validityDays: 90 });
        mockedAuth.mockResolvedValue(sessionOf('u-super', ['SUPER_ADMIN']));
        expect((await del(info.id)).status).toBe(200);
    });
});
