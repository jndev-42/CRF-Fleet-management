/**
 * Dev DB initialization — populates the sqld container with one of two modes:
 *
 *   seed mode (default): delegates to setup-dev.ts targeting the container URL.
 *     Creates all tables + inserts dev fixture data (4 users, 4 vehicles, etc.)
 *
 *   prod-clone mode (--prod-datas): connects to Turso prod via @libsql/client,
 *     reads all tables, and inserts rows into the container sqld.
 *     Requires TURSO_DATABASE_URL (libsql://...) and TURSO_AUTH_TOKEN in .env.local.
 *
 * NOTE: This script intentionally targets http://localhost:8080 (container sqld),
 * not file:./dev.db. The DEV_DB_URL env var passed to setup-dev.ts overrides its default.
 *
 * Usage (called by dev-db.ts, not directly):
 *   tsx scripts/dev-db-init.ts              # seed mode
 *   tsx scripts/dev-db-init.ts --prod-datas # prod clone mode
 */

import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { spawnSync } from 'child_process';
import path from 'path';

const CONTAINER_DB_URL = 'http://localhost:8080';

async function seedMode(): Promise<void> {
  console.log('[dev-db-init] Seeding container with dev fixture data...');
  const result = spawnSync('npx', ['tsx', 'scripts/setup-dev.ts'], {
    stdio: 'inherit',
    // Override the DB URL so setup-dev.ts targets the container, not file:./dev.db
    env: { ...process.env, DEV_DB_URL: CONTAINER_DB_URL },
  });
  if (result.status !== 0) {
    throw new Error('[dev-db-init] setup-dev.ts failed — see output above');
  }
  console.log('[dev-db-init] Seed complete.');
}

async function prodCloneMode(): Promise<void> {
  // Load .env.local to pick up Turso credentials (they may not be in process.env yet)
  config({ path: path.resolve(process.cwd(), '.env.local') });

  const prodUrl = process.env.TURSO_DATABASE_URL;
  const prodToken = process.env.TURSO_AUTH_TOKEN;

  if (
    !prodUrl ||
    prodUrl.startsWith('file:') ||
    prodUrl.startsWith('http://localhost')
  ) {
    console.error(
      '[dev-db-init] ERROR: TURSO_DATABASE_URL must be a real Turso cloud URL (libsql://...)\n' +
        'for --prod-datas mode. Make sure your .env.local contains:\n' +
        '  TURSO_DATABASE_URL=libsql://<your-db>.turso.io\n' +
        '  TURSO_AUTH_TOKEN=<your-token>'
    );
    process.exit(1);
  }

  console.log('[dev-db-init] Connecting to prod Turso DB...');
  const prod = createClient({ url: prodUrl, authToken: prodToken ?? '' });
  const local = createClient({ url: CONTAINER_DB_URL });

  // Enumerate all user tables + their schema SQL from prod up front
  const tablesResult = await prod.execute(
    `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  const tableDefs = tablesResult.rows.map((r) => ({
    name: r.name as string,
    sql: r.sql as string | null,
  }));
  console.log(`[dev-db-init] Found ${tableDefs.length} tables: ${tableDefs.map((t) => t.name).join(', ')}`);

  // sqld's HTTP/Hrana bridge does not appear to honor `PRAGMA foreign_keys =
  // OFF`, even when issued inside the same transaction (verified: FK checks
  // still fire, and fire against tables that don't exist yet — SQLite then
  // reports "no such table" rather than a constraint error). So instead of
  // relying on disabling FK enforcement, row inserts must run in dependency
  // order (parents before children). Build that order from each table's
  // REFERENCES clauses.
  const tableNames = new Set(tableDefs.map((t) => t.name));
  const dependsOn = new Map<string, Set<string>>();
  for (const { name, sql } of tableDefs) {
    const deps = new Set<string>();
    if (sql) {
      for (const m of sql.matchAll(/REFERENCES\s+"([A-Za-z0-9_]+)"/g)) {
        const dep = m[1];
        if (dep !== name && tableNames.has(dep)) deps.add(dep);
      }
    }
    dependsOn.set(name, deps);
  }
  const insertOrder: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) return; // cycle — break it, order among the cycle no longer matters much
    visiting.add(name);
    for (const dep of dependsOn.get(name) ?? []) visit(dep);
    visiting.delete(name);
    visited.add(name);
    insertOrder.push(name);
  }
  for (const { name } of tableDefs) visit(name);

  // Row reads from prod are paginated rather than one unbounded `SELECT *`.
  // The installed @libsql/client (0.5.6) HTTP transport silently kills the
  // process — no rejection, no error, just a clean exit — once a single
  // response crosses a few KB (observed: fine at 50 narrow-ish rows, dead at
  // 55; unrelated to row content, purely response size, so wide tables like
  // Trip die at far fewer rows than narrow ones like User). A small page
  // size keeps every response well under that threshold.
  const PAGE_SIZE = 20;

  const schemaByName = new Map(tableDefs.map((t) => [t.name, t.sql]));

  const tx = await local.transaction('write');
  try {
    // Phase 1a: drop existing local tables in reverse dependency order
    // (children before parents). sqld enforces FK checks on DROP TABLE
    // itself (unlike vanilla SQLite) — dropping a parent while a child
    // table still holds rows referencing it fails with a FOREIGN KEY
    // constraint error, so children must be gone first. Drop is needed so a
    // stale local table (older/fewer columns from a prior seed run or prior
    // clone) doesn't linger and break the row copy below with "no column
    // named X".
    for (const table of [...insertOrder].reverse()) {
      await tx.execute(`DROP TABLE IF EXISTS "${table}"`);
    }

    // Phase 1b: recreate every table's schema from prod, parents first (not
    // strictly required for CREATE, but keeps this symmetric with the drop).
    for (const table of insertOrder) {
      const sql = schemaByName.get(table);
      if (!sql) {
        console.log(`[dev-db-init]   ${table}: no schema found, skipping`);
        continue;
      }
      await tx.execute(sql.replace(/^CREATE TABLE\b/, 'CREATE TABLE IF NOT EXISTS'));
    }

    // Phase 2: copy rows in dependency order so a child row's FK target
    // already has its parent row inserted.
    for (const table of insertOrder) {
      if (!schemaByName.get(table)) continue;

      let insertSql: string | undefined;
      let totalRows = 0;
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await prod.execute(
          `SELECT * FROM "${table}" ORDER BY rowid LIMIT ${PAGE_SIZE} OFFSET ${offset}`
        );
        if (page.rows.length === 0) break;

        if (!insertSql) {
          const cols = page.columns;
          const placeholders = cols.map(() => '?').join(', ');
          insertSql = `INSERT OR REPLACE INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
        }
        for (const row of page.rows) {
          const args = page.columns.map((col) => row[col] ?? null);
          await tx.execute({ sql: insertSql, args });
        }
        totalRows += page.rows.length;

        if (page.rows.length < PAGE_SIZE) break;
      }

      if (totalRows === 0) {
        console.log(`[dev-db-init]   ${table}: empty`);
      } else {
        console.log(`[dev-db-init]   ${table}: ${totalRows} rows cloned`);
      }
    }

    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }

  console.log('[dev-db-init] Prod clone complete.');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--prod-datas')) {
    await prodCloneMode();
  } else {
    await seedMode();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
