/**
 * Test d'intégration — scripts/add-trip-photos-skipped-in.ts sur une base antérieure à la v5.59.0.
 * Exécute le vrai script (`npx tsx`) sur une base SQLite temporaire.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';

const run = promisify(execFile);
const SCRIPT = path.resolve(__dirname, '../../../scripts/add-trip-photos-skipped-in.ts');

let dir: string;
let dbUrl: string;
let db: Client;

async function migrate(...flags: string[]): Promise<string> {
    const { stdout } = await run('npx', ['tsx', SCRIPT, ...flags], {
        env: { ...process.env, TURSO_DATABASE_URL: dbUrl, TURSO_AUTH_TOKEN: '' },
    });
    return stdout;
}

async function snapshot(): Promise<string[]> {
    const res = await db.execute(`SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`);
    return res.rows.map(r => `${String(r.type)}:${String(r.name)}:${String(r.sql)}`);
}

async function columns(table: string): Promise<string[]> {
    return (await db.execute(`PRAGMA table_info("${table}")`)).rows.map(r => String(r.name));
}

beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'trip-photos-in-mig-'));
    dbUrl = `file:${path.join(dir, 'mig.db')}`;
    db = createClient({ url: dbUrl });
    await db.execute(`CREATE TABLE "Trip" (id TEXT PRIMARY KEY, photosSkipped INTEGER)`);
});

afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
});

describe('scripts/add-trip-photos-skipped-in.ts', () => {
    it('dry-run : n\'écrit rien', async () => {
        const before = await snapshot();
        const out = await migrate();
        expect(out).toContain('dry-run');
        expect(out).toContain('Relancer avec --apply');
        expect(await snapshot()).toEqual(before);
    }, 60_000);

    it('--apply : ajoute la colonne, puis confirme', async () => {
        const out = await migrate('--apply');
        expect(out).toContain('ajoutée et confirmée');
        expect(await columns('Trip')).toContain('photosSkippedIn');
    }, 60_000);

    it('second --apply : rien à faire', async () => {
        const before = await snapshot();
        const out = await migrate('--apply');
        expect(out).toContain('Rien à faire');
        expect(await snapshot()).toEqual(before);
    }, 60_000);
});
