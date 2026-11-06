/**
 * Tests d'intégration — GET /api/demo/status (disponibilité du mode démo).
 *
 * Base démo réelle (fichier SQLite temporaire) : la démo n'est disponible que si
 * le client démo existe ET que sa dernière recopie est terminée (`DemoMeta.state = 'ready'`).
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/demo/status/route';
import { auth } from '@/auth';
import { resetDemoClientForTests } from '@/lib/demo/server';
import { cloneDatabase } from '@/lib/demo/cloneDatabase';

const mockedAuth = vi.mocked(auth);
const dir = mkdtempSync(join(tmpdir(), 'martine-demo-status-'));
let fileIndex = 0;

/** Nouvelle base démo vide, branchée par l'environnement. */
function useFreshDemoDb() {
    const url = `file:${join(dir, `demo-${fileIndex++}.db`)}`;
    vi.stubEnv('TURSO_DEMO_DATABASE_URL', url);
    resetDemoClientForTests();
    return createClient({ url });
}

async function availability() {
    const res = await GET();
    expect(res.status).toBe(200);
    return (await res.json()) as { available: boolean };
}

describe('GET /api/demo/status', () => {
    beforeEach(() => {
        vi.stubEnv('TURSO_DATABASE_URL', 'libsql://crf-prod.turso.io');
        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', roles: ['CHVL'] } } as never);
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        resetDemoClientForTests();
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('available: true après une recopie terminée (tout compte connecté)', async () => {
        const demo = useFreshDemoDb();
        const source = createClient({ url: `file:${join(dir, `source-${fileIndex++}.db`)}` });
        await source.execute(`CREATE TABLE "Vehicle" (id TEXT PRIMARY KEY)`);
        await cloneDatabase(source, demo);
        expect(await availability()).toEqual({ available: true });
    });

    it('available: false pendant une recopie (ou recopie interrompue)', async () => {
        const demo = useFreshDemoDb();
        await demo.execute(`CREATE TABLE "DemoMeta" (id INTEGER PRIMARY KEY, state TEXT NOT NULL, refreshedAt TEXT)`);
        await demo.execute(`INSERT INTO "DemoMeta" (id, state) VALUES (1, 'refreshing')`);
        // `refreshing` pour tout compte connecté : une personne en démo y reste.
        expect(await availability()).toEqual({ available: false, refreshing: true });
    });

    it('available: false sur une base démo jamais recopiée (DemoMeta absente)', async () => {
        useFreshDemoDb();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await availability()).toEqual({ available: false });
        errorSpy.mockRestore();
    });

    it('available: false sans base démo configurée', async () => {
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', '');
        resetDemoClientForTests();
        expect(await availability()).toEqual({ available: false });
    });

    it("available: false quand l'URL démo désigne la prod", async () => {
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', 'https://crf-prod.turso.io');
        resetDemoClientForTests();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await availability()).toEqual({ available: false });
        errorSpy.mockRestore();
    });

    it("ne révèle pas l'URL de la base démo", async () => {
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', 'libsql://secret-demo.invalid');
        resetDemoClientForTests();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const text = await (await GET()).text();
        expect(text).not.toContain('secret-demo');
        errorSpy.mockRestore();
    });

    describe('canRefresh (bouton de recopie)', () => {
        const asRoles = (...roles: string[]) =>
            mockedAuth.mockResolvedValue({ user: { email: 'u@dev.local', roles } } as never);
        const silenceErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

        it('true pour un SUPER_ADMIN avec base démo configurée, démo prête', async () => {
            asRoles('SUPER_ADMIN');
            const demo = useFreshDemoDb();
            const source = createClient({ url: `file:${join(dir, `source-${fileIndex++}.db`)}` });
            await source.execute(`CREATE TABLE "Vehicle" (id TEXT PRIMARY KEY)`);
            await cloneDatabase(source, demo);
            expect(await availability()).toEqual({ available: true, canRefresh: true });
        });

        it('true pour un SUPER_ADMIN sur une base jamais recopiée', async () => {
            asRoles('SUPER_ADMIN');
            useFreshDemoDb();
            const errorSpy = silenceErrors();
            expect(await availability()).toEqual({ available: false, canRefresh: true });
            errorSpy.mockRestore();
        });

        it('absent pour un SUPER_ADMIN sans base démo configurée', async () => {
            asRoles('SUPER_ADMIN');
            vi.stubEnv('TURSO_DEMO_DATABASE_URL', '');
            resetDemoClientForTests();
            expect(await availability()).toEqual({ available: false });
        });

        it("absent pour un SUPER_ADMIN quand l'URL démo désigne la prod", async () => {
            asRoles('SUPER_ADMIN');
            vi.stubEnv('TURSO_DEMO_DATABASE_URL', 'https://crf-prod.turso.io');
            resetDemoClientForTests();
            const errorSpy = silenceErrors();
            expect(await availability()).toEqual({ available: false });
            errorSpy.mockRestore();
        });

        it.each([
            ['ADMIN', ['ADMIN']],
            ['SUPER_ADMIN + INACTIF', ['SUPER_ADMIN', 'INACTIF']],
        ])('jamais renvoyé à %s', async (_label, roles) => {
            asRoles(...roles);
            useFreshDemoDb();
            const errorSpy = silenceErrors();
            expect(await availability()).toEqual({ available: false });
            errorSpy.mockRestore();
        });
    });

    it('500 si la session est illisible', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockedAuth.mockRejectedValue(new Error('boom'));
        const res = await GET();
        expect(res.status).toBe(500);
        errorSpy.mockRestore();
    });
});
