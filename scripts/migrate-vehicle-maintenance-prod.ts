/**
 * Production Migration: VehicleMaintenance Table Creation
 * 
 * Run with: DOTENV_CONFIG_PATH=.env ./node_modules/.bin/tsx -r dotenv/config scripts/migrate-vehicle-maintenance-prod.ts
 */

import { createClient } from '@libsql/client';

let rawUrl = (process.env.TURSO_DATABASE_URL || '').trim();
if (rawUrl.startsWith('libsql://')) {
  rawUrl = rawUrl.replace(/^libsql:\/\//, 'https://');
}

const db = createClient({
  url: rawUrl,
  authToken: (process.env.TURSO_AUTH_TOKEN || '').trim(),
});

async function runProdMigration() {
  console.log('🔌 Connecting to Prod Database:', rawUrl);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS "VehicleMaintenance" (
        "id"        TEXT NOT NULL PRIMARY KEY,
        "vehicleId" TEXT NOT NULL REFERENCES "Vehicle"(id),
        "startDate" TEXT NOT NULL,
        "endDate"   TEXT,
        "reason"    TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ Table "VehicleMaintenance" created / verified on Prod DB');

  const result = await db.execute(`SELECT count(*) as count FROM "VehicleMaintenance"`);
  console.log('📊 Current rows in "VehicleMaintenance":', result.rows[0].count);
}

runProdMigration()
  .then(() => {
    console.log('🎉 Production migration completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
