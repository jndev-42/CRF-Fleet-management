/**
 * Migration: add qrToken column to Vehicle table.
 * Each vehicle can have a unique QR token that allows any authenticated
 * CRF user (regardless of UL or role) to borrow/return that specific vehicle.
 *
 * Run: npx tsx scripts/add-vehicle-qr-token.ts
 */

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const db = createClient({
    url: (process.env.TURSO_DATABASE_URL || '').trim(),
    authToken: (process.env.TURSO_AUTH_TOKEN || '').trim(),
});

async function main() {
    console.log('Adding qrToken column to Vehicle table...');

    try {
        await db.execute('ALTER TABLE Vehicle ADD COLUMN qrToken TEXT');
        console.log('✅  Column qrToken added successfully.');
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('duplicate column') || msg.includes('already exists')) {
            console.log('ℹ️  Column qrToken already exists — skipping ALTER TABLE.');
        } else {
            console.error('❌  Migration failed (ALTER TABLE):', msg);
            process.exit(1);
        }
    }

    // Create a unique index separately (SQLite doesn't support UNIQUE in ADD COLUMN)
    try {
        await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_qrToken ON Vehicle(qrToken)');
        console.log('✅  Unique index on qrToken created.');
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('❌  Migration failed (CREATE INDEX):', msg);
        process.exit(1);
    }

    process.exit(0);
}

main();
