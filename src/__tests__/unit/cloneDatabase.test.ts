// @vitest-environment node
/**
 * `cloneDatabase` sur deux vraies bases SQLite locales (fichiers temporaires :
 * `migrate`/`batch` ouvrent leur propre connexion, ce qu'une base `:memory:` ne survit pas).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient, type Client, type InStatement } from '@libsql/client';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { cloneDatabase, dependencyOrder, readDemoState, withDependents, DEMO_SCHEMA_ONLY_TABLES } from '@/lib/demo/cloneDatabase';
import { REFERENTIEL_FTS_DDL, REFERENTIEL_REBUILD_SQL, REFERENTIEL_TABLES } from '@/lib/referentiel/schema';

let dir: string;
let source: Client;
let target: Client;
/** Toutes les requêtes reçues par la source : uniquement des SELECT attendus. */
let sourceStatements: string[];

function spySource(client: Client): Client {
    const record = (stmt: InStatement | string) => sourceStatements.push(typeof stmt === 'string' ? stmt : stmt.sql);
    return {
        ...client,
        execute: ((stmt: InStatement | string, args?: unknown) => {
            record(stmt);
            return typeof stmt === 'string' ? client.execute(stmt, args as never) : client.execute(stmt);
        }) as Client['execute'],
        batch: () => { throw new Error('batch interdit sur la source'); },
        migrate: () => { throw new Error('migrate interdit sur la source'); },
        transaction: () => { throw new Error('transaction interdite sur la source'); },
        executeMultiple: () => { throw new Error('executeMultiple interdit sur la source'); },
    } as Client;
}

async function seedSource(db: Client) {
    await db.executeMultiple(`
        CREATE TABLE "Child" ("id" TEXT PRIMARY KEY, "parentId" TEXT NOT NULL REFERENCES "Parent"("id"), "label" TEXT);
        CREATE TABLE "Parent" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "blob" BLOB, "n" INTEGER);
        CREATE INDEX "Child_parentId_idx" ON "Child"("parentId");
        CREATE UNIQUE INDEX "Parent_name_key" ON "Parent"("name") WHERE "name" <> '';
        CREATE VIEW "ParentNames" AS SELECT name FROM "Parent";
        CREATE TABLE "Log" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "msg" TEXT);
        CREATE TRIGGER "Child_log" AFTER INSERT ON "Child" BEGIN INSERT INTO "Log"(msg) VALUES ('child'); END;
    `);
    for (const t of REFERENTIEL_TABLES) await db.execute(t.ddl);
    await db.execute(REFERENTIEL_FTS_DDL);
    for (let i = 0; i < 7; i++) {
        await db.execute({ sql: `INSERT INTO "Parent" (id, name, blob, n) VALUES (?, ?, ?, ?)`, args: [`p${i}`, `Parent ${i}`, new Uint8Array([i, 255]), i] });
    }
    await db.execute({ sql: `INSERT INTO "Child" (id, parentId, label) VALUES (?, ?, ?)`, args: ['c1', 'p3', null] });
    await db.execute({ sql: `INSERT INTO "Referentiel" (id, fileName, r2Key, status, createdBy) VALUES ('r1', 'pse.pdf', 'k', 'ready', 'a@b')`, args: [] });
    await db.execute({ sql: `INSERT INTO "ReferentielPage" (id, referentielId, page, title, body) VALUES (1, 'r1', 1, 'Hémorragie', 'Compression manuelle')`, args: [] });
    await db.execute(REFERENTIEL_REBUILD_SQL);
}

beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'clone-db-'));
    const raw = createClient({ url: `file:${path.join(dir, 'source.db')}` });
    await seedSource(raw);
    source = spySource(raw);
    target = createClient({ url: `file:${path.join(dir, 'target.db')}` });
    // Cible préexistante : table obsolète (colonnes différentes) et table absente de la source.
    await target.executeMultiple(`
        CREATE TABLE "Parent" ("id" TEXT PRIMARY KEY, "old" TEXT);
        INSERT INTO "Parent" (id, old) VALUES ('stale', 'x');
        CREATE TABLE "Orphan" ("id" TEXT);
    `);
    sourceStatements = [];
});

afterEach(() => {
    target.close();
    rmSync(dir, { recursive: true, force: true });
});

async function names(db: Client, type: string): Promise<string[]> {
    const r = await db.execute({ sql: `SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name`, args: [type] });
    return r.rows.map((row) => row.name as string);
}

describe('cloneDatabase', () => {
    it('recopie schéma, lignes, index, vues et déclencheurs ; supprime le reste de la cible', async () => {
        const summary = await cloneDatabase(source, target, { pageSize: 3 });

        expect(summary.rows).toBe(7 + 1 + 1 + 1 + 1); // Parent, Child, Log (déclencheur source), Referentiel, ReferentielPage
        expect(await names(target, 'table')).toEqual(expect.arrayContaining(['Child', 'Log', 'Parent', 'Referentiel', 'ReferentielPage', 'ReferentielFts']));
        expect(await names(target, 'table')).not.toContain('Orphan');
        expect(await names(target, 'index')).toEqual(expect.arrayContaining(['Child_parentId_idx', 'Parent_name_key']));
        expect(await names(target, 'view')).toEqual(['ParentNames']);
        expect(await names(target, 'trigger')).toEqual(['Child_log']);

        const parents = await target.execute(`SELECT id, name, blob, n FROM "Parent" ORDER BY id`);
        expect(parents.rows).toHaveLength(7);
        expect(parents.rows.find((r) => r.id === 'stale')).toBeUndefined();
        expect(new Uint8Array(parents.rows[2].blob as ArrayBuffer)).toEqual(new Uint8Array([2, 255]));
        expect(Number(parents.rows[6].n)).toBe(6);

        // Le déclencheur est recréé après la copie : il n'a pas rejoué l'insertion de Child.
        const logs = await target.execute(`SELECT COUNT(*) AS n FROM "Log"`);
        expect(Number(logs.rows[0].n)).toBe(1);
    });

    it("reconstruit l'index FTS5 du référentiel", async () => {
        await cloneDatabase(source, target);
        const hits = await target.execute(`SELECT rowid FROM "ReferentielFts" WHERE "ReferentielFts" MATCH 'hemorragie'`);
        expect(hits.rows).toHaveLength(1);
    });

    it("ne fait que des SELECT sur la source (ni transaction, ni écriture)", async () => {
        await cloneDatabase(source, target, { pageSize: 2 });
        expect(sourceStatements.length).toBeGreaterThan(3);
        for (const sql of sourceStatements) expect(sql.trim().toUpperCase().startsWith('SELECT'), sql).toBe(true);
    });

    it('est idempotente : une seconde recopie donne le même résultat', async () => {
        const first = await cloneDatabase(source, target);
        await target.execute(`INSERT INTO "Parent" (id, name) VALUES ('demo-only', 'Ajout démo')`);
        const second = await cloneDatabase(source, target);
        expect(second.rows).toBe(first.rows);
        const r = await target.execute(`SELECT COUNT(*) AS n FROM "Parent"`);
        expect(Number(r.rows[0].n)).toBe(7);
        const hits = await target.execute(`SELECT rowid FROM "ReferentielFts" WHERE "ReferentielFts" MATCH 'compression'`);
        expect(hits.rows).toHaveLength(1);
    });
});

describe('cloneDatabase — état DemoMeta', () => {
    it("passe à 'ready' avec refreshedAt en fin de recopie", async () => {
        expect(await readDemoState(target).catch(() => null)).toBeNull();
        await cloneDatabase(source, target);
        const state = await readDemoState(target);
        expect(state?.state).toBe('ready');
        expect(state?.refreshedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        // DemoMeta n'est pas une table de la source : jamais supprimée ni recopiée comme telle.
        await cloneDatabase(source, target);
        expect((await readDemoState(target))?.state).toBe('ready');
    });

    it("reste 'refreshing' si la recopie échoue après la suppression", async () => {
        await cloneDatabase(source, target);
        const failingSource = {
            ...source,
            execute: ((stmt: InStatement | string, args?: unknown) => {
                const sql = typeof stmt === 'string' ? stmt : stmt.sql;
                if (sql.includes('FROM "Child"')) return Promise.reject(new Error('coupure réseau'));
                return typeof stmt === 'string' ? source.execute(stmt, args as never) : source.execute(stmt);
            }) as Client['execute'],
        } as Client;
        await expect(cloneDatabase(failingSource, target)).rejects.toThrow('coupure réseau');
        expect((await readDemoState(target))?.state).toBe('refreshing');
    });
});

describe('cloneDatabase — secrets jamais recopiés', () => {
    async function seedSecrets(db: Client) {
        await db.executeMultiple(`
            CREATE TABLE "BrandCredential" ("id" TEXT PRIMARY KEY, "passwordEncrypted" TEXT);
            CREATE TABLE "VehicleConnection" ("id" TEXT PRIMARY KEY, "credentialId" TEXT NOT NULL REFERENCES "BrandCredential"("id"));
            CREATE TABLE "RenaultSession" ("id" TEXT PRIMARY KEY, "credentialId" TEXT, "idToken" TEXT);
            CREATE TABLE "McpToken" ("id" TEXT PRIMARY KEY, "tokenHash" TEXT);
            CREATE TABLE "PushSubscription" ("id" TEXT PRIMARY KEY, "endpoint" TEXT);
            INSERT INTO "BrandCredential" VALUES ('cred', 'iv:tag:ct');
            INSERT INTO "VehicleConnection" VALUES ('vc', 'cred');
            INSERT INTO "RenaultSession" VALUES ('rs', 'cred', 'jwt');
            INSERT INTO "McpToken" VALUES ('t', 'hash');
            INSERT INTO "PushSubscription" VALUES ('p', 'https://push.example/1');
        `);
    }

    it('recopie le schéma sans aucune ligne, y compris pour les tables qui en dépendent', async () => {
        const raw = createClient({ url: `file:${path.join(dir, 'source.db')}` });
        await seedSecrets(raw);
        await cloneDatabase(source, target);
        for (const table of [...DEMO_SCHEMA_ONLY_TABLES, 'VehicleConnection']) {
            const r = await target.execute(`SELECT COUNT(*) AS n FROM "${table}"`);
            expect(Number(r.rows[0].n), table).toBe(0);
        }
        // Les autres tables sont toujours recopiées.
        const parents = await target.execute(`SELECT COUNT(*) AS n FROM "Parent"`);
        expect(Number(parents.rows[0].n)).toBe(7);
    });

    it('schemaOnlyTables: [] recopie tout (base locale de développement)', async () => {
        const raw = createClient({ url: `file:${path.join(dir, 'source.db')}` });
        await seedSecrets(raw);
        await cloneDatabase(source, target, { schemaOnlyTables: [] });
        const r = await target.execute(`SELECT COUNT(*) AS n FROM "BrandCredential"`);
        expect(Number(r.rows[0].n)).toBe(1);
    });

    it('withDependents suit les clés étrangères transitivement', () => {
        const deps = withDependents([
            { name: 'A', sql: 'CREATE TABLE A (id TEXT)' },
            { name: 'B', sql: 'CREATE TABLE B (a TEXT REFERENCES "A"(id))' },
            { name: 'C', sql: 'CREATE TABLE C (b TEXT REFERENCES B(id))' },
            { name: 'D', sql: 'CREATE TABLE D (id TEXT)' },
        ], ['A']);
        expect([...deps].sort()).toEqual(['A', 'B', 'C']);
    });
});

describe('dependencyOrder', () => {
    it('place les parents avant les enfants et rompt les cycles', () => {
        const order = dependencyOrder([
            { name: 'C', sql: 'CREATE TABLE "C" (b TEXT REFERENCES "B"(id))' },
            { name: 'B', sql: 'CREATE TABLE "B" (a TEXT REFERENCES A(id))' },
            { name: 'A', sql: 'CREATE TABLE "A" (id TEXT, self TEXT REFERENCES "A"(id))' },
            { name: 'X', sql: 'CREATE TABLE "X" (y TEXT REFERENCES "Y"(id))' },
            { name: 'Y', sql: 'CREATE TABLE "Y" (x TEXT REFERENCES "X"(id))' },
        ]);
        expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
        expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
        expect(order).toHaveLength(5);
    });
});
