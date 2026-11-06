/**
 * Aiguillage de `@/lib/db` : base démo pour une requête démo (en-tête `x-crf-demo: 1`
 * posé par le proxy + base démo configurée), prod sinon — y compris hors requête.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined, outsideRequest: false }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => {
        if (cookieState.outsideRequest) throw new Error('`headers` was called outside a request scope.');
        return { get: (name: string) => (name === 'x-crf-demo' && cookieState.value ? cookieState.value : null) };
    }),
}));

interface FakeClient {
    url: string;
    execute: ReturnType<typeof vi.fn>;
    batch: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
    executeMultiple: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
}
const created = vi.hoisted(() => [] as FakeClient[]);
const failing = vi.hoisted(() => ({ url: '' }));
vi.mock('@libsql/client', () => ({
    createClient: vi.fn(({ url }: { url: string }) => {
        if (failing.url && url === failing.url) throw new Error('URL invalide');
        const client: FakeClient = {
            url,
            execute: vi.fn(async () => ({ rows: [], from: url })),
            batch: vi.fn(async () => [{ from: url }]),
            transaction: vi.fn(async () => ({ from: url })),
            executeMultiple: vi.fn(async () => undefined),
            close: vi.fn(),
        };
        created.push(client);
        return client;
    }),
}));

const PROD_URL = 'libsql://crf-prod.turso.io';
const DEMO_URL = 'libsql://crf-demo.turso.io';

async function loadDb() {
    vi.resetModules();
    created.length = 0;
    return import('@/lib/db');
}

describe('@/lib/db — aiguillage démo', () => {
    beforeEach(() => {
        cookieState.value = undefined;
        cookieState.outsideRequest = false;
        failing.url = '';
        vi.stubEnv('TURSO_DATABASE_URL', PROD_URL);
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', DEMO_URL);
        vi.stubEnv('TURSO_DEMO_AUTH_TOKEN', 'demo-token');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('expose prodDb (https://) et demoDb quand la base démo est configurée', async () => {
        const { prodDb, demoDb } = await loadDb();
        expect((prodDb as unknown as FakeClient).url).toBe('https://crf-prod.turso.io');
        expect((demoDb as unknown as FakeClient).url).toBe('https://crf-demo.turso.io');
    });

    it('sans en-tête démo : prod', async () => {
        const { db } = await loadDb();
        const res = await db.execute('SELECT 1');
        expect((res as unknown as { from: string }).from).toBe('https://crf-prod.turso.io');
    });

    it('avec l\'en-tête démo : base démo (execute, batch, executeMultiple)', async () => {
        cookieState.value = '1';
        const { db, prodDb, demoDb } = await loadDb();
        await db.execute({ sql: 'INSERT INTO t VALUES (?)', args: [1] });
        await db.execute('SELECT ?', [2]);
        await db.batch(['SELECT 1'], 'write');
        await db.executeMultiple('SELECT 1;');
        const demo = demoDb as unknown as FakeClient;
        const prod = prodDb as unknown as FakeClient;
        expect(demo.execute).toHaveBeenCalledWith({ sql: 'INSERT INTO t VALUES (?)', args: [1] });
        expect(demo.execute).toHaveBeenCalledWith('SELECT ?', [2]);
        expect(demo.batch).toHaveBeenCalledWith(['SELECT 1'], 'write');
        expect(demo.executeMultiple).toHaveBeenCalled();
        expect(prod.execute).not.toHaveBeenCalled();
        expect(prod.batch).not.toHaveBeenCalled();
    });

    it('une valeur d\'en-tête autre que 1 : prod', async () => {
        cookieState.value = '0';
        const { db, prodDb } = await loadDb();
        await db.execute('SELECT 1');
        expect((prodDb as unknown as FakeClient).execute).toHaveBeenCalled();
    });

    it('transaction() renvoie la transaction du client résolu', async () => {
        cookieState.value = '1';
        const { db } = await loadDb();
        const tx = await db.transaction('write');
        expect(tx).toEqual({ from: 'https://crf-demo.turso.io' });

        cookieState.value = undefined;
        const tx2 = await db.transaction('write');
        expect(tx2).toEqual({ from: 'https://crf-prod.turso.io' });
    });

    it('hors contexte de requête (cron, script) : prod', async () => {
        cookieState.outsideRequest = true;
        const { db, prodDb, demoDb } = await loadDb();
        await db.execute('SELECT 1');
        expect((prodDb as unknown as FakeClient).execute).toHaveBeenCalled();
        expect((demoDb as unknown as FakeClient).execute).not.toHaveBeenCalled();
    });

    it('base démo non configurée : prod même avec l\'en-tête, demoDb null', async () => {
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', '');
        cookieState.value = '1';
        const { db, prodDb, demoDb } = await loadDb();
        expect(demoDb).toBeNull();
        await db.execute('SELECT 1');
        expect((prodDb as unknown as FakeClient).execute).toHaveBeenCalled();
        expect(created).toHaveLength(1);
    });

    it('le chargement du module ne lève pas sans aucune variable (build)', async () => {
        vi.stubEnv('TURSO_DATABASE_URL', '');
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', '');
        const { db, demoDb } = await loadDb();
        expect(db).toBeDefined();
        expect(demoDb).toBeNull();
    });

    it('client démo impossible à créer : une requête démo échoue sans jamais toucher la prod', async () => {
        failing.url = 'https://crf-demo.turso.io';
        cookieState.value = '1';
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { db, prodDb, demoDb } = await loadDb();
        expect(demoDb).toBeNull();
        await expect(db.execute('INSERT INTO t VALUES (1)')).rejects.toThrow(/indisponible/);
        await expect(db.transaction('write')).rejects.toThrow(/indisponible/);
        expect((prodDb as unknown as FakeClient).execute).not.toHaveBeenCalled();
        expect((prodDb as unknown as FakeClient).transaction).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('URL démo identique à la prod : pas de client démo, prod même avec l\'en-tête', async () => {
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', 'https://crf-prod.turso.io');
        cookieState.value = '1';
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { db, prodDb, demoDb } = await loadDb();
        expect(demoDb).toBeNull();
        await db.execute('SELECT 1');
        expect((prodDb as unknown as FakeClient).execute).toHaveBeenCalled();
        expect(created).toHaveLength(1);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('base de production'));
        errorSpy.mockRestore();
    });

    it('close() ferme la prod et la démo', async () => {
        const { db, prodDb, demoDb } = await loadDb();
        db.close();
        expect((prodDb as unknown as FakeClient).close).toHaveBeenCalled();
        expect((demoDb as unknown as FakeClient).close).toHaveBeenCalled();
    });
});

describe('isDemoRequest', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('vrai seulement avec l\'en-tête du proxy ET la base démo configurée', async () => {
        vi.resetModules();
        const { isDemoRequest } = await import('@/lib/demo/server');
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', DEMO_URL);
        cookieState.outsideRequest = false;
        cookieState.value = '1';
        expect(await isDemoRequest()).toBe(true);
        cookieState.value = undefined;
        expect(await isDemoRequest()).toBe(false);
        cookieState.value = '1';
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', '');
        expect(await isDemoRequest()).toBe(false);
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', DEMO_URL);
        cookieState.outsideRequest = true;
        expect(await isDemoRequest()).toBe(false);
    });
});
