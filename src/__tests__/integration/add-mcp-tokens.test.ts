/**
 * Test d'intégration — scripts/add-mcp-tokens.ts sur une base antérieure à la v5.35.0.
 *
 * Exécute le vrai script (`npx tsx`) sur une base SQLite temporaire : `AuditLog` dans son
 * ancienne forme (sans `via`), aucune table `McpToken`. `TURSO_DATABASE_URL` est passée
 * dans l'environnement : `dotenv` ne la remplace pas.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';

const run = promisify(execFile);
const SCRIPT = path.resolve(__dirname, '../../../scripts/add-mcp-tokens.ts');

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
    const auditCols = await db.execute(`PRAGMA table_info("AuditLog")`);
    const audit = await db.execute(`SELECT id, action FROM "AuditLog" ORDER BY id`);
    return {
        objects: objects.rows.map(r => [r.type, r.name]),
        auditColumns: auditCols.rows.map(r => String(r.name)),
        audit: audit.rows.map(r => [r.id, r.action]),
    };
}

beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'mcp-tokens-mig-'));
    dbUrl = `file:${path.join(dir, 'mig.db')}`;
    db = createClient({ url: dbUrl });
    await db.executeMultiple(`
        CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT, name TEXT);
        CREATE TABLE "AuditLog" (
            "id" TEXT NOT NULL PRIMARY KEY, "createdAt" TEXT NOT NULL, "actorUserId" TEXT, "actorEmail" TEXT,
            "actorName" TEXT, "impersonatedEmail" TEXT, "ulId" TEXT, "method" TEXT NOT NULL, "path" TEXT NOT NULL,
            "action" TEXT NOT NULL, "entityType" TEXT, "entityId" TEXT, "status" INTEGER NOT NULL, "ip" TEXT, "userAgent" TEXT
        );
        INSERT INTO "AuditLog" (id, createdAt, method, path, action, status)
            VALUES ('a1', '2026-10-01T00:00:00.000Z', 'DELETE', '/api/vehicles/x', 'Suppression', 200);
    `);
});

afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
});

describe('scripts/add-mcp-tokens.ts', () => {
    it('dry-run, --apply puis seconde exécution', async () => {
        const before = await snapshot();
        expect(before.auditColumns).not.toContain('via');

        // Dry-run : le plan liste la table et la colonne, rien n'est écrit.
        const dry = await migrate();
        expect(dry).toContain('aucune écriture');
        expect(dry).toContain('McpToken');
        expect(dry).toContain('ADD COLUMN "via"');
        expect(await snapshot()).toEqual(before);

        // --apply : colonne, table et index ajoutés ; l'historique d'audit est conservé.
        const applied = await migrate('--apply');
        expect(applied).toContain('confirmés');
        const after = await snapshot();
        expect(after.auditColumns).toContain('via');
        expect(after.objects).toContainEqual(['table', 'McpToken']);
        expect(after.objects).toContainEqual(['index', 'McpToken_userId_idx']);
        expect(after.audit).toEqual(before.audit);
        const tokenCols = (await db.execute(`PRAGMA table_info("McpToken")`)).rows.map(r => String(r.name));
        expect(tokenCols).toEqual(['id', 'userId', 'name', 'tokenHash', 'tokenPrefix', 'scope', 'createdAt', 'expiresAt', 'lastUsedAt', 'revokedAt']);

        // Seconde exécution : rien à faire, rien ne change.
        const again = await migrate('--apply');
        expect(again).toContain('Rien à faire');
        expect(await snapshot()).toEqual(after);
    }, 60_000);
});
