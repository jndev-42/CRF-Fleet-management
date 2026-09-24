import { describe, it, expect, afterEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { menuSettingNeedsRebuild, menuSettingTableDdl, rebuildMenuSettingTable } from '@/lib/menu-settings-schema';

/**
 * Base SQLite isolée (pas celle de `./setup`) : on y crée volontairement la
 * table avec l'ANCIENNE contrainte CHECK, telle qu'elle existe en production.
 */
const LEGACY_DDL = `CREATE TABLE "MenuSetting" (
    "menu_key"   TEXT NOT NULL PRIMARY KEY,
    "visibility" TEXT NOT NULL DEFAULT 'available'
                 CHECK (visibility IN ('available', 'admin_only', 'disabled')),
    "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

let dir: string;
let client: Client;

async function freshDb(): Promise<Client> {
    dir = mkdtempSync(join(tmpdir(), 'menu-schema-'));
    client = createClient({ url: `file:${join(dir, 'test.db')}` });
    return client;
}

afterEach(() => {
    client?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('menu-settings-schema', () => {
    it('ne signale rien sans table', async () => {
        const db = await freshDb();
        expect(await menuSettingNeedsRebuild(db)).toBe(false);
    });

    it('une table créée avec le DDL courant est à jour et accepte super_admin_only', async () => {
        const db = await freshDb();
        await db.execute(menuSettingTableDdl());
        expect(await menuSettingNeedsRebuild(db)).toBe(false);
        await db.execute(`INSERT INTO "MenuSetting" (menu_key, visibility) VALUES ('expenses', 'super_admin_only')`);
    });

    it('reconstruit une table à l\'ancienne contrainte en conservant les réglages', async () => {
        const db = await freshDb();
        await db.execute(LEGACY_DDL);
        await db.execute(`INSERT INTO "MenuSetting" (menu_key, visibility, updatedAt) VALUES ('inventory', 'admin_only', '2026-01-01 00:00:00'), ('stats', 'disabled', '2026-01-02 00:00:00')`);

        expect(await menuSettingNeedsRebuild(db)).toBe(true);
        await expect(db.execute(`UPDATE "MenuSetting" SET visibility = 'super_admin_only' WHERE menu_key = 'stats'`)).rejects.toThrow();

        await rebuildMenuSettingTable(db);

        expect(await menuSettingNeedsRebuild(db)).toBe(false);
        const rows = await db.execute(`SELECT menu_key, visibility, updatedAt FROM "MenuSetting" ORDER BY menu_key`);
        expect(rows.rows.map(r => [r.menu_key, r.visibility, r.updatedAt])).toEqual([
            ['inventory', 'admin_only', '2026-01-01 00:00:00'],
            ['stats', 'disabled', '2026-01-02 00:00:00'],
        ]);
        await db.execute(`UPDATE "MenuSetting" SET visibility = 'super_admin_only' WHERE menu_key = 'stats'`);
        await expect(db.execute(`UPDATE "MenuSetting" SET visibility = 'n_importe_quoi' WHERE menu_key = 'stats'`)).rejects.toThrow();
    });
});
