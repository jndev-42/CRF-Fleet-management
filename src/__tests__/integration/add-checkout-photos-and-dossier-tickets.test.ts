/**
 * Test d'intégration — scripts/add-checkout-photos-and-dossier-tickets.ts sur une base
 * antérieure à la v5.58.0 (suivi technique v5.56 en place, sans les nouvelles colonnes).
 *
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
const SCRIPT = path.resolve(__dirname, '../../../scripts/add-checkout-photos-and-dossier-tickets.ts');

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
    dir = mkdtempSync(path.join(tmpdir(), 'photos-tickets-mig-'));
    dbUrl = `file:${path.join(dir, 'mig.db')}`;
    db = createClient({ url: dbUrl });
    await db.execute(`CREATE TABLE "UniteLocale" (id TEXT PRIMARY KEY, name TEXT)`);
    await db.execute(`CREATE TABLE "Trip" (id TEXT PRIMARY KEY)`);
    await db.execute(`CREATE TABLE "FleetDossier" (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'OPEN', closedAt TEXT)`);
    await db.execute(`CREATE TABLE "FleetDossierVehicle" (dossierId TEXT NOT NULL, vehicleId TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dossierId, vehicleId))`);
});

afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
});

describe('scripts/add-checkout-photos-and-dossier-tickets.ts', () => {
    it('dry-run : n\'écrit rien', async () => {
        const before = await snapshot();
        const out = await migrate();
        expect(out).toContain('dry-run');
        expect(out).toContain('Relancer avec --apply');
        expect(await snapshot()).toEqual(before);
    }, 60_000);

    it('--apply : ajoute les 5 colonnes et l\'index, puis confirme', async () => {
        const out = await migrate('--apply');
        expect(out).toContain('ajoutés et confirmés');
        expect(await columns('UniteLocale')).toContain('checkoutPhotosRequired');
        expect(await columns('Trip')).toContain('photosSkipped');
        const dossierCols = await columns('FleetDossier');
        for (const c of ['closeReason', 'sourceType', 'sourceId']) expect(dossierCols).toContain(c);
        const idx = await db.execute(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_FleetDossier_source'`);
        expect(idx.rows).toHaveLength(1);
    }, 60_000);

    it('second --apply : rien à faire', async () => {
        const before = await snapshot();
        const out = await migrate('--apply');
        expect(out).toContain('Rien à faire');
        expect(await snapshot()).toEqual(before);
    }, 60_000);

    it('sans FleetDossierVehicle : s\'arrête et renvoie vers add-fleet-tracking.ts', async () => {
        await db.execute(`DROP TABLE "FleetDossierVehicle"`);
        await expect(migrate()).rejects.toMatchObject({ stderr: expect.stringContaining('add-fleet-tracking.ts') });
    }, 60_000);
});
