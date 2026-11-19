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

    it('--apply : crée les tables du module et leurs index, puis vérifie', async () => {
        const out = await migrate('--apply');
        expect(out).toContain('✅ Vérification');
        const after = await objects();
        expect(after).toContain('table:FleetContact');
        expect(after).toContain('index:idx_FleetContact_ulId');
        expect(after).toContain('index:idx_FleetContact_shared');
        for (const t of ['FleetTask', 'FleetTaskAssignee', 'FleetTaskLink', 'FleetAttachment', 'FleetDossier', 'FleetDossierItem', 'FleetControlAppointment']) {
            expect(after).toContain(`table:${t}`);
        }
        for (const i of ['idx_FleetDossier_ulId_status', 'idx_FleetDossier_vehicleId', 'idx_FleetDossierItem_dossierId', 'idx_FleetTask_ulId_status', 'idx_FleetTask_dossierId', 'idx_FleetTaskAssignee_userId', 'idx_FleetTaskLink_target', 'idx_FleetAttachment_owner', 'idx_FleetControlAppointment_ulId']) {
            expect(after).toContain(`index:${i}`);
        }
    }, 60_000);

    it('second --apply : aucune écriture', async () => {
        await db.execute(`INSERT INTO "FleetContact" (id, ulId, name, category, createdAt, updatedAt) VALUES ('c1', 'ul', 'X', 'AUTRE', 't', 't')`);
        const before = await objects();
        const out = await migrate('--apply');
        expect(out).toContain('Rien à faire');
        expect(await objects()).toEqual(before);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetContact"`)).rows[0].n).toBe(1);
    }, 60_000);

    it('base du livrable 1 (FleetContact seule) : ajoute les tables des tâches sans toucher aux contacts', async () => {
        for (const t of ['FleetTask', 'FleetTaskAssignee', 'FleetTaskLink', 'FleetAttachment']) {
            await db.execute(`DROP TABLE "${t}"`);
        }
        const out = await migrate('--apply');
        expect(out).toContain('table FleetTask : ABSENTE');
        expect(out).toContain('✅ Vérification');
        expect(await objects()).toContain('table:FleetAttachment');
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetContact"`)).rows[0].n).toBe(1);
    }, 60_000);

    it('base du livrable 2 (sans dossiers) : ajoute FleetDossier et FleetDossierItem sans toucher aux tâches', async () => {
        await db.execute(`INSERT INTO "FleetTask" (id, ulId, title, createdAt, updatedAt) VALUES ('t1', 'ul', 'X', 't', 't')`);
        for (const t of ['FleetDossier', 'FleetDossierItem']) await db.execute(`DROP TABLE "${t}"`);
        const out = await migrate('--apply');
        expect(out).toContain('table FleetDossier : ABSENTE');
        expect(out).toContain('✅ Vérification');
        const after = await objects();
        expect(after).toContain('table:FleetDossierItem');
        expect(after).toContain('index:idx_FleetDossier_vehicleId');
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetTask"`)).rows[0].n).toBe(1);
    }, 60_000);

    it('base du livrable 3 (sans contrôles) : ajoute FleetControlAppointment sans toucher aux dossiers', async () => {
        await db.execute(`INSERT INTO "FleetDossier" (id, ulId, vehicleId, title, createdAt, updatedAt) VALUES ('d1', 'ul', 'v', 'X', 't', 't')`);
        await db.execute(`DROP TABLE "FleetControlAppointment"`);
        const out = await migrate('--apply');
        expect(out).toContain('table FleetControlAppointment : ABSENTE');
        expect(out).toContain('✅ Vérification');
        const after = await objects();
        expect(after).toContain('table:FleetControlAppointment');
        expect(after).toContain('index:idx_FleetControlAppointment_ulId');
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetDossier"`)).rows[0].n).toBe(1);
    }, 60_000);

    it('table FleetControlAppointment sans taskId : colonne ajoutée, données conservées', async () => {
        await db.execute(`DROP TABLE "FleetControlAppointment"`);
        await db.execute(`CREATE TABLE "FleetControlAppointment" (id TEXT PRIMARY KEY, ulId TEXT NOT NULL, vehicleId TEXT NOT NULL, controlType TEXT NOT NULL, appointmentDate TEXT NOT NULL, contactId TEXT, notes TEXT, createdBy TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE (vehicleId, controlType))`);
        await db.execute(`INSERT INTO "FleetControlAppointment" (id, ulId, vehicleId, controlType, appointmentDate, createdAt, updatedAt) VALUES ('a1', 'ul', 'v', 'CT', '2026-12-01', 't', 't')`);
        expect(await migrate()).toContain('colonne FleetControlAppointment.taskId : ABSENTE');
        const out = await migrate('--apply');
        expect(out).toContain('✅ Vérification');
        const cols = (await db.execute(`PRAGMA table_info("FleetControlAppointment")`)).rows.map(r => String(r.name));
        expect(cols).toContain('taskId');
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetControlAppointment"`)).rows[0].n).toBe(1);
        expect(await migrate('--apply')).toContain('Rien à faire');
    }, 60_000);
});
