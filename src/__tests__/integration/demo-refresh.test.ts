/**
 * Tests d'intégration — recopie manuelle de la base démo : `POST /api/demo/refresh`
 * et module partagé `refreshDemoDatabase` (verrou, bail).
 *
 * Deux vraies bases SQLite temporaires (prod et démo) et le vrai `cloneDatabase`,
 * enveloppé pour compter ses appels. Seuls la session et la purge R2 sont mockés.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { createClient, type Client, type InStatement } from '@libsql/client';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dbs = vi.hoisted(() => ({ prod: null as unknown, demo: null as unknown }));
vi.mock('@/lib/db', () => ({
    get db() { return dbs.prod; },
    get prodDb() { return dbs.prod; },
    get demoDb() { return dbs.demo; },
}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/r2', () => ({ purgeDemoObjects: vi.fn() }));
vi.mock('@/lib/demo/cloneDatabase', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/demo/cloneDatabase')>();
    return { ...actual, cloneDatabase: vi.fn(actual.cloneDatabase) };
});

import { POST, maxDuration as refreshMaxDuration } from '@/app/api/demo/refresh/route';
import { maxDuration as cronMaxDuration } from '@/app/api/cron/daily-mileage-check/route';
import { auth } from '@/auth';
import { cloneDatabase, readDemoState } from '@/lib/demo/cloneDatabase';
import { DEMO_REFRESH_LEASE_MS, refreshDemoDatabase } from '@/lib/demo/refresh';
import { purgeDemoObjects } from '@/lib/r2';

const mockedAuth = vi.mocked(auth);
const mockedClone = vi.mocked(cloneDatabase);
const mockedPurge = vi.mocked(purgeDemoObjects);

const dir = mkdtempSync(join(tmpdir(), 'martine-demo-refresh-'));
let fileIndex = 0;
let prod: Client;
let demo: Client;

const session = (...roles: string[]) => ({ user: { email: 'u@dev.local', roles } }) as never;
const callRoute = () => (POST as unknown as () => Promise<Response>)();

async function seedLock(ageMs: number): Promise<string> {
    const startedAt = new Date(Date.now() - ageMs).toISOString();
    await demo.execute(`CREATE TABLE IF NOT EXISTS "DemoRefreshLock" (id INTEGER PRIMARY KEY, startedAt TEXT NOT NULL)`);
    await demo.execute({ sql: `INSERT OR REPLACE INTO "DemoRefreshLock" (id, startedAt) VALUES (1, ?)`, args: [startedAt] });
    return startedAt;
}

async function lockRows() {
    return (await demo.execute(`SELECT startedAt FROM "DemoRefreshLock"`)).rows;
}

/** Source dont la lecture des lignes échoue : la cible a déjà été vidée à ce stade. */
function sourceFailingOnRows(client: Client): Client {
    return {
        ...client,
        execute: ((stmt: InStatement) => {
            const sql = typeof stmt === 'string' ? stmt : stmt.sql;
            return sql.startsWith('SELECT *')
                ? Promise.reject(new Error('secret-turso-detail'))
                : client.execute(stmt);
        }) as Client['execute'],
    } as Client;
}

beforeEach(async () => {
    prod = createClient({ url: `file:${join(dir, `prod-${fileIndex++}.db`)}` });
    demo = createClient({ url: `file:${join(dir, `demo-${fileIndex++}.db`)}` });
    await prod.execute(`CREATE TABLE "Vehicle" (id TEXT PRIMARY KEY)`);
    await prod.execute(`INSERT INTO "Vehicle" (id) VALUES ('VL1')`);
    dbs.prod = prod;
    dbs.demo = demo;
    vi.stubEnv('TURSO_DATABASE_URL', 'libsql://crf-prod.turso.io');
    vi.stubEnv('TURSO_DEMO_DATABASE_URL', 'libsql://crf-demo.turso.io');
    mockedClone.mockClear();
    mockedPurge.mockReset();
    mockedPurge.mockResolvedValue(2);
    mockedAuth.mockResolvedValue(session('SUPER_ADMIN'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    prod.close();
    demo.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('POST /api/demo/refresh', () => {
    it('401 sans session, aucune recopie', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await callRoute()).status).toBe(401);
        expect(mockedClone).not.toHaveBeenCalled();
    });

    it.each([
        ['ADMIN', ['ADMIN']],
        ['PRESIDENT', ['PRESIDENT']],
        ['SUPER_ADMIN + INACTIF', ['SUPER_ADMIN', 'INACTIF']],
    ])('403 pour %s, aucune recopie', async (_label, roles) => {
        mockedAuth.mockResolvedValue(session(...roles));
        expect((await callRoute()).status).toBe(403);
        expect(mockedClone).not.toHaveBeenCalled();
    });

    it('503 sans base démo configurée', async () => {
        dbs.demo = null;
        const res = await callRoute();
        expect(res.status).toBe(503);
        expect((await res.json()).error).toMatch(/pas configurée/);
        expect(mockedClone).not.toHaveBeenCalled();
        expect(mockedPurge).not.toHaveBeenCalled();
    });

    it("503 quand l'URL démo désigne la prod : aucune écriture", async () => {
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', 'https://crf-prod.turso.io');
        const res = await callRoute();
        expect(res.status).toBe(503);
        expect(mockedClone).not.toHaveBeenCalled();
        const tables = await demo.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`);
        expect(tables.rows).toHaveLength(0);
    });

    it('409 si une recopie est en cours : celle-ci continue, verrou intact', async () => {
        const startedAt = await seedLock(60_000);
        const res = await callRoute();
        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe("Une recopie de la base de démonstration est déjà en cours ou vient de s'interrompre : réessayez dans quelques minutes.");
        expect(mockedClone).not.toHaveBeenCalled();
        expect((await lockRows())[0].startedAt).toBe(startedAt);
    });

    it('500 générique si la recopie échoue : verrou libéré, démo indisponible, détail dans les logs', async () => {
        await callRoute(); // Démo d'abord « ready » : l'échec doit la rendre indisponible.
        expect((await readDemoState(demo))?.state).toBe('ready');
        dbs.prod = sourceFailingOnRows(prod);

        const res = await callRoute();

        expect(res.status).toBe(500);
        const text = await res.text();
        expect(text).not.toContain('secret-turso-detail');
        expect(JSON.parse(text).error).toBe('La recopie de la base de démonstration a échoué');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[demo] recopie'), 'secret-turso-detail');
        expect(await lockRows()).toHaveLength(0);
        expect((await readDemoState(demo))?.state).toBe('refreshing');
    });

    it('200 avec purged: null si seule la purge R2 échoue', async () => {
        mockedPurge.mockRejectedValue(new Error('R2 indisponible'));
        const res = await callRoute();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.purged).toBeNull();
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[demo] purge'), 'R2 indisponible');
        expect((await readDemoState(demo))?.state).toBe('ready');
    });

    it('200 : recopie la prod, démo de nouveau prête, verrou libéré', async () => {
        const res = await callRoute();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            success: true,
            tables: 1,
            rows: 1,
            durationMs: expect.any(Number),
            purged: 2,
        });
        expect((await demo.execute(`SELECT id FROM "Vehicle"`)).rows[0].id).toBe('VL1');
        expect((await readDemoState(demo))?.state).toBe('ready');
        expect(await lockRows()).toHaveLength(0);
    });

    it('500 si la session est illisible', async () => {
        mockedAuth.mockRejectedValue(new Error('boom'));
        expect((await callRoute()).status).toBe(500);
        expect(mockedClone).not.toHaveBeenCalled();
    });
});

describe('refreshDemoDatabase — verrou', () => {
    it.each([
        ['POST /api/demo/refresh', refreshMaxDuration],
        ['cron', cronMaxDuration],
    ])('le bail dépasse le maxDuration de %s', (_label, maxDuration) => {
        expect(DEMO_REFRESH_LEASE_MS).toBeGreaterThan(maxDuration * 1000);
    });

    it("n'écrit rien en prod", async () => {
        await refreshDemoDatabase();
        const tables = await prod.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`);
        expect(tables.rows.map((r) => r.name)).toEqual(['Vehicle']);
    });

    it('deux démarrages simultanés (cron et clic) : une seule recopie', async () => {
        const results = await Promise.all([refreshDemoDatabase(), refreshDemoDatabase()]);
        expect(results.map((r) => r.status).sort()).toEqual(['locked', 'ok']);
        expect(mockedClone).toHaveBeenCalledTimes(1);
    });

    it('le verrou est tenu pendant la copie et survit à la suppression des tables', async () => {
        let lockedDuringClone: string | undefined;
        const actual = await vi.importActual<typeof import('@/lib/demo/cloneDatabase')>('@/lib/demo/cloneDatabase');
        mockedClone.mockImplementationOnce(async (source, target) => {
            const summary = await actual.cloneDatabase(source, target);
            lockedDuringClone = (await refreshDemoDatabase()).status;
            return summary;
        });
        expect((await refreshDemoDatabase()).status).toBe('ok');
        expect(lockedDuringClone).toBe('locked');
    });

    it('respecte un verrou de moins de 6 min', async () => {
        await seedLock(DEMO_REFRESH_LEASE_MS - 30_000);
        expect((await refreshDemoDatabase()).status).toBe('locked');
        expect(mockedClone).not.toHaveBeenCalled();
    });

    it('reprend un verrou orphelin de plus de 6 min', async () => {
        await seedLock(DEMO_REFRESH_LEASE_MS + 30_000);
        expect((await refreshDemoDatabase()).status).toBe('ok');
        expect(mockedClone).toHaveBeenCalledTimes(1);
        expect(await lockRows()).toHaveLength(0);
    });

    it('ne libère pas un verrou repris entre-temps par une autre recopie', async () => {
        const other = new Date(Date.now() + 1000).toISOString();
        mockedClone.mockImplementationOnce(async () => {
            await demo.execute({ sql: `UPDATE "DemoRefreshLock" SET startedAt = ?`, args: [other] });
            return { tables: 0, rows: 0, durationMs: 0 };
        });
        await refreshDemoDatabase();
        expect((await lockRows())[0].startedAt).toBe(other);
    });

    it('base démo injoignable : résultat failed, sans lever', async () => {
        dbs.demo = {
            execute: vi.fn().mockRejectedValue(new Error('Turso indisponible')),
        };
        expect(await refreshDemoDatabase()).toEqual({ status: 'failed' });
        expect(mockedClone).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[demo] recopie'), 'Turso indisponible');
    });

    it('verrou impossible à libérer : le résultat reste celui de la recopie', async () => {
        const realExecute = demo.execute.bind(demo);
        const flaky = {
            ...demo,
            migrate: demo.migrate.bind(demo),
            execute: ((stmt: InStatement) =>
                typeof stmt !== 'string' && stmt.sql.startsWith('DELETE')
                    ? Promise.reject(new Error('coupure'))
                    : realExecute(stmt)) as Client['execute'],
        };
        dbs.demo = flaky;
        expect((await refreshDemoDatabase()).status).toBe('ok');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('verrou de recopie non libéré'), 'coupure');
    });
});
