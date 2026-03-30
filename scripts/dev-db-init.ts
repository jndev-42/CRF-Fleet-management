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

  // Enumerate all user tables from prod
  const tablesResult = await prod.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  const tables = tablesResult.rows.map((r) => r.name as string);
  console.log(`[dev-db-init] Found ${tables.length} tables: ${tables.join(', ')}`);

  for (const table of tables) {
    // Recreate schema in container
    const schemaResult = await prod.execute({
      sql: `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
      args: [table],
    });
    const schemaSql = schemaResult.rows[0]?.sql as string | undefined;
    if (!schemaSql) {
      console.log(`[dev-db-init]   ${table}: no schema found, skipping`);
      continue;
    }
    await local.execute(
      schemaSql.replace(/^CREATE TABLE\b/, 'CREATE TABLE IF NOT EXISTS')
    );

    // Read all rows from prod
    const rows = await prod.execute(`SELECT * FROM "${table}"`);
    if (rows.rows.length === 0) {
      console.log(`[dev-db-init]   ${table}: empty`);
      continue;
    }

    // Get column names from result columns
    const cols = rows.columns;
    const placeholders = cols.map(() => '?').join(', ');
    const insertSql = `INSERT OR REPLACE INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

    for (const row of rows.rows) {
      const args = cols.map((col) => row[col] ?? null);
      await local.execute({ sql: insertSql, args });
    }
    console.log(`[dev-db-init]   ${table}: ${rows.rows.length} rows cloned`);
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
