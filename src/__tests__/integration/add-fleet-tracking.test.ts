/**
 * Test d'intégration — scripts/add-fleet-tracking.ts sur une base antérieure à la v5.55.0.
 *
 * Exécute le vrai script (`npx tsx`) sur une base SQLite temporaire sans table
 * `FleetContact`. `TURSO_DATABASE_URL` est passée dans l'environnement : `dotenv` ne
 * la remplace pas.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';

const run = promisify(execFile);
const SCRIPT = path.resolve(__dirname, '../../../scripts/add-fleet-tracking.ts');

let dir: string;
let dbUrl: string;
let db: Client;

async function migrate(...flags: string[]): Promise<string> {
    const { stdout } = await run('npx', ['tsx', SCRIPT, ...flags], {
        env: { ...process.env, TURSO_DATABASE_URL: dbUrl, TURSO_AUTH_TOKEN: '' },
    });
    return stdout;
}

async function objects(): Promise<string[]> {
    const res = await db.execute(`SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`);
    return res.rows.map(r => `${String(r.type)}:${String(r.name)}`);
}

beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'fleet-tracking-mig-'));
    dbUrl = `file:${path.join(dir, 'mig.db')}`;
    db = createClient({ url: dbUrl });
    await db.execute(`CREATE TABLE "UniteLocale" (id TEXT PRIMARY KEY, name TEXT)`);
});

afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
});

describe('scripts/add-fleet-tracking.ts', () => {
    it('dry-run : n\'écrit rien', async () => {
        const before = await objects();
        const out = await migrate();
        expect(out).toContain('dry-run');
        expect(out).toContain('Relancer avec --apply');
        expect(await objects()).toEqual(before);
    }, 60_000);

    it('--apply : crée FleetContact et ses deux index, puis vérifie', async () => {
        const out = await migrate('--apply');
        expect(out).toContain('✅ Vérification');
        const after = await objects();
        expect(after).toContain('table:FleetContact');
        expect(after).toContain('index:idx_FleetContact_ulId');
        expect(after).toContain('index:idx_FleetContact_shared');
    }, 60_000);

    it('second --apply : aucune écriture', async () => {
        await db.execute(`INSERT INTO "FleetContact" (id, ulId, name, category, createdAt, updatedAt) VALUES ('c1', 'ul', 'X', 'AUTRE', 't', 't')`);
        const before = await objects();
        const out = await migrate('--apply');
        expect(out).toContain('Rien à faire');
        expect(await objects()).toEqual(before);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetContact"`)).rows[0].n).toBe(1);
    }, 60_000);
});
