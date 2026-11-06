// @vitest-environment node
/**
 * Migration `scripts/add-vehicle-documents.ts` : exécutée pour de vrai (processus
 * `tsx`) contre une base SQLite fichier jetable. Vérifie la reprise des guides
 * existants, l'absence de doublon à la relance, et que le dry-run n'écrit rien.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createClient } from '@libsql/client';

const ROOT = resolve(__dirname, '../../..');
const SCRIPT = join(ROOT, 'scripts', 'add-vehicle-documents.ts');

const tmpDir = mkdtempSync(join(tmpdir(), 'martine-migration-'));
let counter = 0;
let dbUrl = '';

afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
});

function run(...args: string[]): string {
    // `npx` résout tsx depuis le dépôt (ou un worktree qui partage le node_modules du dépôt).
    return execFileSync('npx', ['tsx', SCRIPT, ...args], {
        cwd: ROOT,
        env: { ...process.env, TURSO_DATABASE_URL: dbUrl, TURSO_AUTH_TOKEN: '' },
        encoding: 'utf8',
    });
}

function client() {
    return createClient({ url: dbUrl });
}

async function seedVehicles() {
    const db = client();
    await db.execute(`CREATE TABLE "Vehicle" (
        id TEXT PRIMARY KEY, name TEXT, guideR2Key TEXT, guideFileName TEXT, guideSize INTEGER, guideUpdatedAt TEXT
    )`);
    await db.execute(`INSERT INTO "Vehicle" VALUES ('v1', 'VPSP 182', 'vehicle-guides/v1/a.pdf', 'Guide 182.pdf', 1234, '2026-09-01T10:00:00.000Z')`);
    await db.execute(`INSERT INTO "Vehicle" VALUES ('v2', 'VL 186', NULL, NULL, NULL, NULL)`);
    await db.execute(`INSERT INTO "Vehicle" VALUES ('v3', 'VPSP 190', 'vehicle-guides/v3/b.pdf', 'Guide 190.pdf', 99, '2026-09-02T10:00:00.000Z')`);
    db.close();
}

beforeEach(async () => {
    dbUrl = `file:${join(tmpDir, `m${++counter}.db`)}`;
    await seedVehicles();
});

async function documents() {
    const db = client();
    const res = await db.execute(`SELECT vehicleId, r2Key, fileName, size, createdAt FROM VehicleDocument ORDER BY vehicleId`);
    db.close();
    return res.rows;
}

describe('scripts/add-vehicle-documents.ts', () => {
    it("dry-run : n'écrit rien (pas même la table)", async () => {
        const out = run();
        expect(out).toContain('(dry-run)');
        expect(out).toContain('guides à reprendre : 2');

        const db = client();
        const table = await db.execute(`SELECT name FROM sqlite_master WHERE name = 'VehicleDocument'`);
        db.close();
        expect(table.rows).toHaveLength(0);
    });

    it('--apply : crée la table et reprend chaque guide avec même clé, nom, taille et date', async () => {
        const out = run('--apply');
        expect(out).toContain('2 guide(s) repris');

        const rows = await documents();
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            vehicleId: 'v1',
            r2Key: 'vehicle-guides/v1/a.pdf',
            fileName: 'Guide 182.pdf',
            size: 1234,
            createdAt: '2026-09-01T10:00:00.000Z',
        });
        expect(rows[1]).toMatchObject({ vehicleId: 'v3', r2Key: 'vehicle-guides/v3/b.pdf' });
    });

    it("--apply : l'index sur vehicleId existe et les colonnes guide* sont conservées", async () => {
        run('--apply');
        const db = client();
        const index = await db.execute(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_VehicleDocument_vehicleId'`);
        const vehicle = await db.execute(`SELECT guideR2Key FROM "Vehicle" WHERE id = 'v1'`);
        db.close();
        expect(index.rows).toHaveLength(1);
        expect(vehicle.rows[0].guideR2Key).toBe('vehicle-guides/v1/a.pdf');
    });

    it('relance : aucun doublon, rien à faire', async () => {
        run('--apply');
        const out = run('--apply');
        expect(out).toContain('Rien à faire');
        expect(await documents()).toHaveLength(2);
    });

    it("relance après un nouveau guide déposé entre migration et bascule : seul celui-ci est repris", async () => {
        run('--apply');
        const db = client();
        await db.execute(`UPDATE "Vehicle" SET guideR2Key = 'vehicle-guides/v2/c.pdf', guideFileName = 'Nouveau.pdf', guideSize = 5, guideUpdatedAt = '2026-10-01T10:00:00.000Z' WHERE id = 'v2'`);
        db.close();

        run('--apply');
        const rows = await documents();
        expect(rows).toHaveLength(3);
        expect(rows.find(r => r.vehicleId === 'v2')).toMatchObject({ r2Key: 'vehicle-guides/v2/c.pdf', fileName: 'Nouveau.pdf' });
    });

    it("relance après le retrait d'un document repris : il n'est pas recréé", async () => {
        run('--apply');
        // Ce que fait DELETE /api/vehicles/[id]/documents/[documentId] sur un ancien guide.
        const db = client();
        await db.execute(`DELETE FROM VehicleDocument WHERE vehicleId = 'v1'`);
        await db.execute(`UPDATE "Vehicle" SET guideR2Key = NULL, guideFileName = NULL, guideSize = NULL, guideUpdatedAt = NULL WHERE id = 'v1'`);
        db.close();

        run('--apply');
        const rows = await documents();
        expect(rows.map(r => r.vehicleId)).toEqual(['v3']);
    });

    it('un guide sans nom, taille ni date : repli sur le nom par défaut, la taille 0 et la date du jour', async () => {
        const db = client();
        await db.execute(`UPDATE "Vehicle" SET guideR2Key = 'vehicle-guides/v2/x.pdf', guideFileName = NULL, guideSize = NULL, guideUpdatedAt = NULL WHERE id = 'v2'`);
        db.close();

        run('--apply');
        const row = (await documents()).find(r => r.vehicleId === 'v2');
        expect(row).toBeDefined();
        expect(row?.r2Key).toBe('vehicle-guides/v2/x.pdf');
        expect(row?.fileName).toBe('guide-verification.pdf');
        expect(Number(row?.size)).toBe(0);
        expect(String(row?.createdAt).length).toBeGreaterThan(0);
        expect(Number.isNaN(Date.parse(String(row?.createdAt)))).toBe(false);
    });

    it('une base sans guide : crée la table, ne reprend rien', async () => {
        const db = client();
        await db.execute(`UPDATE "Vehicle" SET guideR2Key = NULL`);
        db.close();
        run('--apply');
        expect(await documents()).toHaveLength(0);
    });
});
