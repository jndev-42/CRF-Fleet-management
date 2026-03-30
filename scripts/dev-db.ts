/**
 * Dev DB lifecycle manager — Apple Container + sqld (libSQL server)
 *
 * Checks the state of the crf-dev-db container and ensures it's running
 * before the dev server starts. Called automatically via npm predev hooks.
 *
 * Container state machine:
 *   running  → skip (data intact, no re-init)
 *   stopped  → restart only (data persists in .dev-db/ directory)
 *   missing  → create + wait for ready + run init
 *
 * Data persistence: bind-mount of .dev-db/ into the container.
 * Reset: npm run db:reset destroys container + .dev-db/ directory.
 *
 * Usage (called by npm scripts, not directly):
 *   tsx scripts/dev-db.ts              # seed mode (default)
 *   INIT_MODE=prod-datas tsx scripts/dev-db.ts  # prod clone mode
 *   tsx scripts/dev-db.ts --reset      # destroy + remove data dir
 */

import { execSync, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const CONTAINER_NAME = 'crf-dev-db';
const IMAGE = 'ghcr.io/tursodatabase/libsql-server:latest';
const PORT = 8080;
const MAX_WAIT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;
// Local directory for container data persistence — gitignored
const DATA_DIR = path.resolve(process.cwd(), '.dev-db');

type ContainerState = 'running' | 'stopped' | 'missing';

function runCmd(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return '';
  }
}

function getContainerState(): ContainerState {
  const out = runCmd(`container inspect ${CONTAINER_NAME} 2>/dev/null`);
  if (!out) return 'missing';
  try {
    const info: unknown = JSON.parse(out);
    const entry = Array.isArray(info) ? info[0] : info;
    const status =
      typeof entry === 'object' && entry !== null
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic container inspect JSON
          ((entry as any)?.State?.Status as string | undefined) ?? ''
        : '';
    return status === 'running' ? 'running' : 'stopped';
  } catch {
    return 'missing';
  }
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createContainer(): void {
  console.log(`[dev-db] Creating container ${CONTAINER_NAME} on port ${PORT}...`);
  ensureDataDir();
  execSync(
    `container run -d --name ${CONTAINER_NAME} -p ${PORT}:8080 -v ${DATA_DIR}:/var/lib/sqld ${IMAGE}`,
    { stdio: 'inherit' }
  );
}

function startContainer(): void {
  console.log(`[dev-db] Restarting stopped container ${CONTAINER_NAME}...`);
  execSync(`container start ${CONTAINER_NAME}`, { stdio: 'inherit' });
}

function removeContainer(): void {
  runCmd(`container rm -f ${CONTAINER_NAME} 2>/dev/null`);
}

async function waitForReady(): Promise<void> {
  console.log('[dev-db] Waiting for sqld to be ready...');
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.status < 500) {
        console.log('[dev-db] sqld is ready.');
        return;
      }
    } catch {
      // not ready yet — keep polling
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`[dev-db] sqld did not become ready within ${MAX_WAIT_MS / 1000}s`);
}

function runInit(mode: 'seed' | 'prod-clone'): void {
  console.log(`[dev-db] Initializing DB (mode: ${mode})...`);
  const args = mode === 'prod-clone' ? ['--prod-datas'] : [];
  const result = spawnSync('npx', ['tsx', 'scripts/dev-db-init.ts', ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error('[dev-db] DB initialization failed — see output above');
  }
}

async function reset(): Promise<void> {
  console.log('[dev-db] Resetting dev DB...');
  removeContainer();
  if (fs.existsSync(DATA_DIR)) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    console.log('[dev-db] Data directory removed.');
  }
  console.log('[dev-db] Done. Run npm run dev to reinitialize with fresh data.');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--reset')) {
    await reset();
    return;
  }

  const initMode: 'seed' | 'prod-clone' =
    process.env.INIT_MODE === 'prod-datas' ? 'prod-clone' : 'seed';

  const state = getContainerState();
  console.log(`[dev-db] Container state: ${state}`);

  if (state === 'running') {
    console.log('[dev-db] Container already running — skipping init.');
    return;
  }

  if (state === 'stopped') {
    try {
      startContainer();
      await waitForReady();
      // Data persists in .dev-db/ — no re-init needed
      console.log('[dev-db] Container restarted with existing data.');
      return;
    } catch {
      // Apple Container reported stopped but start failed (stale state) — fall through to create
      console.log('[dev-db] Start failed (stale state), recreating container...');
    }
  }

  // missing or stale → clean up any remnant, create fresh + init
  removeContainer();
  createContainer();
  await waitForReady();
  runInit(initMode);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
