/**
 * Test d'intégration — scripts/add-mission-report-edits.ts sur une base antérieure à la v5.36.0.
 *
 * Exécute le vrai script (`npx tsx`) sur une base SQLite temporaire : `mission_reports`
 * sans colonnes accident, aucune table `mission_report_edits`, aucun rôle RESP_MISSION.
 * `TURSO_DATABASE_URL` est passée dans l'environnement : `dotenv` ne la remplace pas.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';

const run = promisify(execFile);
const SCRIPT = path.resolve(__dirname, '../../../scripts/add-mission-report-edits.ts');

let dir: string;
let dbUrl: string;
let db: Client;

async function migrate(...flags: string[]): Promise<string> {
    const { stdout } = await run('npx', ['tsx', SCRIPT, ...flags], {
        env: { ...process.env, TURSO_DATABASE_URL: dbUrl, TURSO_AUTH_TOKEN: '' },
    });
    return stdout;
}

async function snapshot() {
    const objects = await db.execute(`SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`);
    const cols = await db.execute(`PRAGMA table_info("mission_reports")`);
    const roles = await db.execute(`SELECT id, name FROM "Role" ORDER BY id`);
    const userRoles = await db.execute(`SELECT userId, roleId FROM "UserRole" ORDER BY userId, roleId`);
    const userUls = await db.execute(`SELECT userId, ulId, roles FROM "UserUL" ORDER BY userId`);
    return {
        objects: objects.rows.map(r => [r.type, r.name]),
        reportColumns: cols.rows.map(r => String(r.name)),
        roles: roles.rows.map(r => [r.id, r.name]),
        userRoles: userRoles.rows.map(r => [r.userId, r.roleId]),
        userUls: userUls.rows.map(r => [r.userId, r.ulId, r.roles]),
    };
}

beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'mission-edits-mig-'));
    dbUrl = `file:${path.join(dir, 'mig.db')}`;
    db = createClient({ url: dbUrl });
    await db.executeMultiple(`
        CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT);
        CREATE TABLE "Role" (id TEXT PRIMARY KEY, name TEXT UNIQUE);
        CREATE TABLE "UserRole" (userId TEXT, roleId TEXT, PRIMARY KEY (userId, roleId));
        CREATE TABLE "UserUL" (userId TEXT, ulId TEXT, is_home INTEGER, roles TEXT, PRIMARY KEY (userId, ulId));
        CREATE TABLE "mission_reports" (id TEXT PRIMARY KEY, mission_name TEXT, ulId TEXT, dt_code TEXT);
        INSERT INTO "User" (id, email, name) VALUES ('u1', 'u1@test.com', 'Un');
        INSERT INTO "Role" (id, name) VALUES ('role-admin', 'ADMIN');
        INSERT INTO "UserRole" (userId, roleId) VALUES ('u1', 'role-admin');
        INSERT INTO "UserUL" (userId, ulId, is_home, roles) VALUES ('u1', 'ul-18', 1, 'ADMIN,CI/RPAPS');
        INSERT INTO "mission_reports" (id, mission_name, ulId) VALUES ('r1', 'Ancien rapport', 'ul-18');
    `);
});

afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
});

describe('scripts/add-mission-report-edits.ts', () => {
    it('dry-run, --apply puis seconde exécution', async () => {
        const before = await snapshot();
        expect(before.reportColumns).not.toContain('volunteer_accident');

        // Dry-run : le plan liste colonnes, table, index et rôle ; rien n'est écrit.
        const dry = await migrate();
        expect(dry).toContain('aucune écriture');
        expect(dry).toContain('ADD COLUMN "volunteer_accident"');
        expect(dry).toContain('ADD COLUMN "volunteer_accident_details"');
        expect(dry).toContain('mission_report_edits');
        expect(dry).toContain('role-resp_mission');
        expect(await snapshot()).toEqual(before);

        // --apply : colonnes, table, index et rôle ajoutés.
        const applied = await migrate('--apply');
        expect(applied).toContain('confirmés');
        const after = await snapshot();
        expect(after.reportColumns).toEqual(expect.arrayContaining(['volunteer_accident', 'volunteer_accident_details']));
        expect(after.objects).toContainEqual(['table', 'mission_report_edits']);
        expect(after.objects).toContainEqual(['index', 'mission_report_edits_report_id_idx']);
        expect(after.roles).toContainEqual(['role-resp_mission', 'RESP_MISSION']);

        // Rapports existants : accident = 0, description NULL.
        const row = await db.execute(`SELECT volunteer_accident, volunteer_accident_details FROM "mission_reports" WHERE id = 'r1'`);
        expect(Number(row.rows[0].volunteer_accident)).toBe(0);
        expect(row.rows[0].volunteer_accident_details).toBeNull();

        // Aucun compte ne reçoit le rôle.
        expect(after.userRoles).toEqual(before.userRoles);
        expect(after.userUls).toEqual(before.userUls);

        // Seconde exécution : rien à faire, rien d'écrit.
        const again = await migrate('--apply');
        expect(again).toContain('Rien à faire');
        expect(await snapshot()).toEqual(after);
    }, 60_000);
});
