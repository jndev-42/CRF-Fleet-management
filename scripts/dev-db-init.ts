/**
 * Dev DB initialization — populates the sqld container with one of two modes:
 *
 *   seed mode (default): delegates to setup-dev.ts targeting the container URL.
 *     Creates all tables + inserts dev fixture data (4 users, 4 vehicles, etc.)
 *
 *   prod-clone mode (--prod-datas): connects to Turso prod via @libsql/client,
 *     and copies it into the container sqld (src/lib/demo/cloneDatabase.ts).
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
import { cloneDatabase } from '../src/lib/demo/cloneDatabase';

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

  // Cœur partagé avec la recopie nocturne prod → démo : lectures paginées
  // (SELECT seuls) sur la prod, cible supprimée puis recréée parents d'abord,
  // index FTS5 du référentiel reconstruit en fin de copie.
  const summary = await cloneDatabase(prod, local, {
    pageSize: 20,
    // Base locale du développeur : tout est recopié, comme avant (la démo, elle, exclut les secrets).
    schemaOnlyTables: [],
    log: (message) => console.log(`[dev-db-init]   ${message}`),
  });
  console.log(`[dev-db-init] ${summary.tables} tables, ${summary.rows} rows in ${summary.durationMs} ms`);

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
