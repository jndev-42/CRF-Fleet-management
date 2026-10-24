/**
 * Serveur MCP /api/mcp, de bout en bout : jeton Bearer → outil `api_request` → assertion
 * interne → `auth()` réel (src/auth.ts) → route REST réelle → `withAudit`.
 *
 * Vraie base de test. Mockés : NextAuth (aucun cookie : seul le MCP authentifie),
 * `next/headers` (en-têtes de la requête interne en cours), `after()` et `fetch` — qui
 * route la requête interne vers le handler Next.js correspondant, comme le serveur le ferait.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('next-auth', () => ({
    default: vi.fn(() => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn(async () => null) })),
}));
const currentHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => currentHeaders.value) }));
const afterTasks = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock('next/server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('next/server')>()),
    after: vi.fn((task: () => Promise<void>) => { afterTasks.push(task); }),
}));
vi.mock('@/lib/drive', () => ({ deleteDriveFolder: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/push', () => ({
    sendPushNotification: vi.fn().mockResolvedValue(undefined),
    notifyRoles: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
    getRenaultVehicleData: vi.fn().mockResolvedValue(null),
    isConnectedInDb: vi.fn().mockResolvedValue(false),
}));

import { POST as MCP_POST } from '@/app/api/mcp/route';
import { GET as GET_VEHICLES } from '@/app/api/vehicles/route';
import { PATCH as PATCH_VEHICLE } from '@/app/api/vehicles/[id]/route';
import { MCP_ASSERTION_HEADER, verifyMcpAssertion } from '@/lib/mcp/assertion';
import { createMcpToken, revokeMcpToken } from '@/lib/mcp/tokens';
import { MAX_RESPONSE_CHARS } from '@/lib/mcp/tools';
import { db, seedRoles, seedUniteLocale, seedUser, seedUserRole, seedUserUL, seedVehicle } from './setup';

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Route la requête interne vers le handler réel, en exposant ses en-têtes à `headers()`. */
async function internalFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const req = new Request(input, init);
    currentHeaders.value = new Headers(req.headers);
    const { pathname } = new URL(req.url);
    const vehicle = pathname.match(/^\/api\/vehicles\/([^/]+)$/);
    if (pathname === '/api/vehicles' && req.method === 'GET') return (GET_VEHICLES as unknown as Handler)(req, { params: Promise.resolve({}) });
    if (vehicle && req.method === 'PATCH') return (PATCH_VEHICLE as unknown as Handler)(req, { params: Promise.resolve({ id: vehicle[1] }) });
    return new Response(JSON.stringify({ error: 'route non simulée' }), { status: 404 });
}

const fetchSpy = vi.fn(internalFetch);

let rpcId = 0;
async function rpc(token: string | null, method: string, params: Record<string, unknown> = {}) {
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
    };
    if (token) headers.authorization = `Bearer ${token}`;
    return MCP_POST(new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    }));
}

/** Corps JSON-RPC d'une réponse (JSON direct ou flux SSE à un message). */
async function rpcResult(res: Response): Promise<Record<string, unknown>> {
    const text = await res.text();
    const data = text.includes('data:') ? text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join('') : text;
    const message = JSON.parse(data) as { result?: Record<string, unknown>; error?: unknown };
    if (!message.result) throw new Error(`Erreur JSON-RPC : ${JSON.stringify(message.error)}`);
    return message.result;
}

async function callTool(token: string, name: string, args: Record<string, unknown>) {
    const res = await rpc(token, 'tools/call', { name, arguments: args });
    expect(res.status).toBe(200);
    const result = await rpcResult(res) as { content: { type: string; text: string }[]; isError?: boolean };
    return { text: result.content.map(c => c.text).join('\n'), isError: !!result.isError };
}

async function flushAfter() {
    for (const task of afterTasks.splice(0)) await task();
}

async function seedAdmin(id = 'u-admin') {
    await seedUser({ id, email: `${id}@croix-rouge.fr`, name: 'Admin MCP' });
    await seedUserRole(id, 'ADMIN');
    await seedUserUL({ userId: id, ulId: 'ul-paris-18', isHome: true });
}

let savedSecret: string | undefined;

beforeEach(async () => {
    savedSecret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'secret-de-test-mcp';
    afterTasks.length = 0;
    currentHeaders.value = new Headers();
    fetchSpy.mockClear();
    vi.stubGlobal('fetch', fetchSpy);
    await seedRoles();
    await seedUniteLocale();
    await seedUniteLocale({ id: 'ul-lyon', name: 'Lyon', slug: 'lyon' });
    await seedAdmin();
});

afterEach(() => {
    vi.unstubAllGlobals();
    if (savedSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = savedSecret;
});

describe('authentification de /api/mcp', () => {
    it('401 sans jeton ou avec un jeton inconnu', async () => {
        expect((await rpc(null, 'tools/list')).status).toBe(401);
        expect((await rpc(`crf_mcp_${'a'.repeat(43)}`, 'tools/list')).status).toBe(401);
        expect((await rpc('pas-un-jeton', 'tools/list')).status).toBe(401);
    });

    it('401 avec un jeton révoqué', async () => {
        const { token, info } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        await revokeMcpToken(info.id);
        expect((await rpc(token, 'tools/list')).status).toBe(401);
    });

    it('401 avec un jeton expiré', async () => {
        const { token, info } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 30 });
        await db.execute({ sql: `UPDATE "McpToken" SET expiresAt = ? WHERE id = ?`, args: ['2020-01-01T00:00:00.000Z', info.id] });
        expect((await rpc(token, 'tools/list')).status).toBe(401);
    });

    it('401 quand le propriétaire est rétrogradé ou devient INACTIF', async () => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        expect((await rpc(token, 'tools/list')).status).toBe(200);
        await seedUserUL({ userId: 'u-admin', ulId: 'ul-paris-18', isHome: true, roles: ['ADMIN', 'INACTIF'] });
        expect((await rpc(token, 'tools/list')).status).toBe(401);
        await seedUserUL({ userId: 'u-admin', ulId: 'ul-paris-18', isHome: true, roles: ['CHVL'] });
        expect((await rpc(token, 'tools/list')).status).toBe(401);
    });

    it('propose whoami, list_api_routes et api_request', async () => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        const result = await rpcResult(await rpc(token, 'tools/list')) as { tools: { name: string }[] };
        expect(result.tools.map(t => t.name).sort()).toEqual(['api_request', 'list_api_routes', 'whoami']);
    });

    it("le jeton brut n'ouvre aucune autre route de l'API (401)", async () => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'write', validityDays: 90 });
        currentHeaders.value = new Headers({ authorization: `Bearer ${token}` });
        const res = await GET_VEHICLES(new Request('http://localhost/api/vehicles', { headers: { authorization: `Bearer ${token}` } }));
        expect(res.status).toBe(401);
    });
});

describe('outils', () => {
    it('whoami : le propriétaire, ses rôles, son UL et la portée du jeton', async () => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        const { text } = await callTool(token, 'whoami', {});
        const body = JSON.parse(text);
        expect(body).toMatchObject({
            email: 'u-admin@croix-rouge.fr', roles: ['ADMIN'], ul: { id: 'ul-paris-18', name: 'Paris 18' },
            token: { name: 'Claude', scope: 'lecture seule' },
        });
        // La session MCP agit toujours sur l'UL d'attache : aucune autre UL n'est proposée.
        expect(body).not.toHaveProperty('availableULs');
    });

    it('list_api_routes : filtre texte, sans les routes exclues', async () => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        const { text } = await callTool(token, 'list_api_routes', { filter: 'vehicles/[id]' });
        expect(text).toContain('/api/vehicles/[id]');
        expect(text).not.toContain('/api/trips');
        const all = (await callTool(token, 'list_api_routes', {})).text;
        expect(all).not.toMatch(/\/api\/(cron|auth|mcp)/);
    });
});

describe('api_request', () => {
    it("lecture : la route répond avec les droits et l'UL du propriétaire", async () => {
        await seedVehicle({ id: 'v-paris', name: 'VL186', plate: 'AA-111-AA', ulId: 'ul-paris-18' });
        await seedVehicle({ id: 'v-lyon', name: 'VL999', plate: 'BB-222-BB', ulId: 'ul-lyon' });
        const { token, info } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });

        const { text, isError } = await callTool(token, 'api_request', { method: 'GET', path: '/api/vehicles' });
        expect(isError).toBe(false);
        expect(text.startsWith('HTTP 200')).toBe(true);
        expect(text).toContain('VL186');
        expect(text).not.toContain('VL999');

        const [url, init] = fetchSpy.mock.calls[0];
        expect(String(url)).toBe('http://localhost/api/vehicles');
        const headers = new Headers(init?.headers);
        expect(verifyMcpAssertion(headers.get(MCP_ASSERTION_HEADER))).toEqual({ userId: 'u-admin', tokenId: info.id, scope: 'read' });
        expect(headers.get('user-agent')).toBe('CRF-MCP/Claude');
        expect(headers.get('authorization')).toBeNull();
    });

    it("jeton read : l'écriture est refusée sans aucun appel HTTP", async () => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        const { text, isError } = await callTool(token, 'api_request', { method: 'PATCH', path: '/api/vehicles/VL186', body: { mileage: 1 } });
        expect(isError).toBe(true);
        expect(text).toMatch(/lecture seule/);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("écriture : résultat de la route, ligne d'audit au nom du propriétaire marquée MCP", async () => {
        await seedVehicle({ id: 'v-paris', name: 'VL186', plate: 'AA-111-AA', ulId: 'ul-paris-18', mileage: 1000 });
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude bureau', scope: 'write', validityDays: 90 });

        const { text, isError } = await callTool(token, 'api_request', { method: 'PATCH', path: '/api/vehicles/VL186', body: { mileage: 1500 } });
        expect(isError).toBe(false);
        expect(text.startsWith('HTTP 200')).toBe(true);
        expect((await db.execute(`SELECT mileage FROM "Vehicle" WHERE id = 'v-paris'`)).rows[0].mileage).toBe(1500);

        await flushAfter();
        const rows = (await db.execute(`SELECT * FROM "AuditLog"`)).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            actorUserId: 'u-admin',
            actorEmail: 'u-admin@croix-rouge.fr',
            impersonatedEmail: null,
            method: 'PATCH',
            path: '/api/vehicles/VL186',
            action: "Modification d'un véhicule",
            status: 200,
            userAgent: 'CRF-MCP/Claude bureau',
            via: 'MCP · Claude bureau',
        });
    });

    it('écriture refusée par la route : le statut 4xx est renvoyé tel quel', async () => {
        await seedVehicle({ id: 'v-lyon', name: 'VL999', plate: 'BB-222-BB', ulId: 'ul-lyon' });
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'write', validityDays: 90 });
        const { text, isError } = await callTool(token, 'api_request', { method: 'PATCH', path: '/api/vehicles/VL999', body: { mileage: 1 } });
        expect(isError).toBe(true);
        expect(text.startsWith('HTTP 404')).toBe(true);
    });

    it.each([
        '/api/cron/daily-alerts',
        '/api/auth/session',
        '/api/mcp',
        '/api/mcp-tokens',
        '/api/inconnue',
        '/login',
        'https://evil.example/api/vehicles',
        '/api/../api/cron/daily-alerts',
    ])('chemin non autorisé : %s', async (path) => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'write', validityDays: 90 });
        const { text, isError } = await callTool(token, 'api_request', { method: 'GET', path });
        expect(isError).toBe(true);
        expect(text).toMatch(/chemin non autorisé/);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('méthode absente de la route : refusée sans appel', async () => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'write', validityDays: 90 });
        const { text, isError } = await callTool(token, 'api_request', { method: 'PUT', path: '/api/vehicles/VL186' });
        expect(isError).toBe(true);
        expect(text).toMatch(/n'accepte pas PUT/);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('grosse réponse : tronquée avec mention', async () => {
        fetchSpy.mockImplementationOnce(async () => new Response('x'.repeat(MAX_RESPONSE_CHARS + 500), { headers: { 'content-type': 'application/json' } }));
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        const { text } = await callTool(token, 'api_request', { method: 'GET', path: '/api/vehicles' });
        expect(text).toMatch(/réponse tronquée/);
        expect(text.length).toBeLessThan(MAX_RESPONSE_CHARS + 500);
    });

    it('réponse binaire : résumée (type, taille), jamais transmise', async () => {
        fetchSpy.mockImplementationOnce(async () => new Response(new Uint8Array([37, 80, 68, 70, 1, 2, 3]), { headers: { 'content-type': 'application/pdf' } }));
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        const { text } = await callTool(token, 'api_request', { method: 'GET', path: '/api/vehicles/VL186/guide' });
        expect(text).toContain('application/pdf');
        expect(text).toContain('7 octets');
        expect(text).not.toContain('%PDF');
    });

    it('paramètres de requête ajoutés à l’URL', async () => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        await callTool(token, 'api_request', { method: 'GET', path: '/api/vehicles', query: { dt: 'true', ids: ['a', 'b'] } });
        expect(String(fetchSpy.mock.calls[0][0])).toBe('http://localhost/api/vehicles?dt=true&ids=a&ids=b');
    });
});
