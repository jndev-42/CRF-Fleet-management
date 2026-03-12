/**
 * Migration script for production Turso database.
 * Usage: TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/migrate-prod.ts
 */
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith('file:')) {
    console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL, not a local file.');
    process.exit(1);
}

const db = createClient({ url, authToken });

const migrations = [
    {
        name: 'Trip.renaultDataValidated',
        sql: 'ALTER TABLE Trip ADD COLUMN renaultDataValidated INTEGER DEFAULT NULL',
    },
    {
        name: 'Trip.renaultLastCheckedAt',
        sql: 'ALTER TABLE Trip ADD COLUMN renaultLastCheckedAt TEXT DEFAULT NULL',
    },
];

async function run() {
    for (const migration of migrations) {
        try {
            await db.execute(migration.sql);
            console.log('✓', migration.name);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- libSQL error shape
        } catch (e: any) {
            if (e?.message?.includes('duplicate column') || e?.message?.includes('already exists')) {
                console.log('~', migration.name, '(déjà présent)');
            } else {
                console.error('✗', migration.name, e?.message);
                process.exit(1);
            }
        }
    }
    console.log('Migration terminée.');
}

run();
