/**
 * Migration script: ajoute la colonne maxBatteryCapacityKwh à la table Vehicle.
 * Permet le suivi de la consommation en kWh/100km pour les véhicules électriques.
 *
 * Idempotent — peut être relancé sans risque.
 * Usage : npx tsx scripts/add-battery-capacity.ts
 */
import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
    console.log('Starting DB migration to add maxBatteryCapacityKwh...');
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    // Idempotent guard: only ALTER TABLE if column doesn't exist yet
    const cols = await db.execute(`PRAGMA table_info("Vehicle")`);
    const hasColumn = cols.rows.some(r => r.name === 'maxBatteryCapacityKwh');

    if (!hasColumn) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "maxBatteryCapacityKwh" INTEGER`);
        console.log('✅ Added maxBatteryCapacityKwh column');
    } else {
        console.log('⚠️  maxBatteryCapacityKwh column already exists, skipping ALTER TABLE');
    }

    console.log('🎉 Migration maxBatteryCapacityKwh terminée.');
    console.log('ℹ️  Pour définir la capacité d\'un véhicule électrique, utilisez l\'interface d\'administration.');
}

main().catch(console.error);
