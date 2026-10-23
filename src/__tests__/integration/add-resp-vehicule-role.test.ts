/**
 * Test d'intégration — scripts/add-resp-vehicule-role.ts (lignes « Migration UL » et
 * « Migration globale » de la spec).
 *
 * Exécute le vrai script (`npx tsx`) sur une base SQLite temporaire, avec des tables
 * Role / User / UserRole / UserUL minimales. `--env /dev/null` empêche le script de
 * lire un `.env` local : seule `TURSO_DATABASE_URL` le pilote.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';

const run = promisify(execFile);
const SCRIPT = path.resolve(__dirname, '../../../scripts/add-resp-vehicule-role.ts');

let dir: string;
let dbUrl: string;
let db: Client;

async function migrate(...flags: string[]): Promise<string> {
    const { stdout } = await run('npx', ['tsx', SCRIPT, '--env', '/dev/null', ...flags], {
        env: { ...process.env, TURSO_DATABASE_URL: dbUrl, TURSO_AUTH_TOKEN: '' },
    });
    return stdout;
}

async function snapshot() {
    const uls = await db.execute(`SELECT userId, ulId, roles FROM "UserUL" ORDER BY userId, ulId`);
    const userRoles = await db.execute(`SELECT userId, roleId FROM "UserRole" ORDER BY userId, roleId`);
    const roles = await db.execute(`SELECT id, name FROM "Role" ORDER BY id`);
    return {
        uls: uls.rows.map(r => [r.userId, r.ulId, r.roles]),
        userRoles: userRoles.rows.map(r => [r.userId, r.roleId]),
        roles: roles.rows.map(r => [r.id, r.name]),
    };
}

beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'resp-vehicule-mig-'));
    dbUrl = `file:${path.join(dir, 'mig.db')}`;
    db = createClient({ url: dbUrl });
    await db.executeMultiple(`
        CREATE TABLE "Role" (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
        CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT);
        CREATE TABLE "UserRole" (userId TEXT NOT NULL, roleId TEXT NOT NULL, PRIMARY KEY (userId, roleId));
        CREATE TABLE "UserUL" (userId TEXT NOT NULL, ulId TEXT NOT NULL, is_home INTEGER DEFAULT 0, roles TEXT, PRIMARY KEY (userId, ulId));
        INSERT INTO "Role" VALUES ('role-cadre', 'CADRE'), ('role-chvl', 'CHVL'), ('role-cadrex', 'CADREX');
        INSERT INTO "User" VALUES ('u-cadre', 'cadre@test.com', 'Cadre'), ('u-cadrex', 'cadrex@test.com', 'Cadrex'), ('u-chvl', 'chvl@test.com', 'Chvl');
        INSERT INTO "UserRole" VALUES ('u-cadre', 'role-cadre'), ('u-cadrex', 'role-cadrex'), ('u-chvl', 'role-chvl');
        INSERT INTO "UserUL" VALUES
            ('u-cadre', 'ul-a', 1, 'CADRE,CHVL'),
            ('u-cadrex', 'ul-a', 1, 'CADREX'),
            ('u-chvl', 'ul-a', 1, 'CHVL');
    `);
});

afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
});

describe('scripts/add-resp-vehicule-role.ts', () => {
    it('dry-run, --apply puis seconde exécution', async () => {
        const before = await snapshot();

        // Dry-run : le plan liste le cadre, rien n'est écrit.
        const dry = await migrate();
        expect(dry).toContain('cadre@test.com');
        expect(dry).toContain('aucune écriture');
        expect(await snapshot()).toEqual(before);

        // --apply : CSV complétée, UserRole et ligne Role ajoutés ; CADREX intact.
        const applied = await migrate('--apply');
        expect(applied).toContain('Migration appliquée et vérifiée');
        const after = await snapshot();
        expect(after.uls).toEqual([
            ['u-cadre', 'ul-a', 'CADRE,CHVL,RESP_VEHICULE'],
            ['u-cadrex', 'ul-a', 'CADREX'],
            ['u-chvl', 'ul-a', 'CHVL'],
        ]);
        expect(after.userRoles).toContainEqual(['u-cadre', 'role-resp_vehicule']);
        expect(after.userRoles.filter(([u]) => u === 'u-cadrex')).toEqual([['u-cadrex', 'role-cadrex']]);
        expect(after.roles).toContainEqual(['role-resp_vehicule', 'RESP_VEHICULE']);

        // Seconde exécution : rien ne change.
        const again = await migrate('--apply');
        expect(again).toContain('Rien à faire');
        expect(await snapshot()).toEqual(after);
    }, 60_000);
});
