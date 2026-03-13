/**
 * Migration script: ajoute la colonne maxFuelCapacity à la table Vehicle.
 * Met à jour les véhicules de production connus avec leur capacité réelle.
 *
 * Idempotent — peut être relancé sans risque.
 * Usage : npx tsx scripts/add-max-fuel-capacity.ts
 */
import { createClient } from '@libsql/client';
import 'dotenv/config';

async function main() {
    console.log('Starting DB migration to add maxFuelCapacity...');
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    // Idempotent guard: only ALTER TABLE if column doesn't exist yet
    const cols = await db.execute(`PRAGMA table_info("Vehicle")`);
    const hasColumn = cols.rows.some(r => r.name === 'maxFuelCapacity');

    if (!hasColumn) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "maxFuelCapacity" INTEGER`);
        console.log('✅ Added maxFuelCapacity column');
    } else {
        console.log('⚠️  maxFuelCapacity column already exists, skipping ALTER TABLE');
    }

    // Seed known production vehicles
    await db.execute({
        sql: `UPDATE "Vehicle" SET "maxFuelCapacity" = ? WHERE "name" = ?`,
        args: [56, 'VL 486'],
    });
    console.log('✅ Updated VL 486 → 56 L');

    await db.execute({
        sql: `UPDATE "Vehicle" SET "maxFuelCapacity" = ? WHERE "name" = ?`,
        args: [55, 'VL 188'],
    });
    console.log('✅ Updated VL 188 → 55 L');

    await db.execute({
        sql: `UPDATE "Vehicle" SET "maxFuelCapacity" = ? WHERE "name" = ?`,
        args: [80, 'VPSP 182'],
    });
    console.log('✅ Updated VPSP 182 → 80 L');

    console.log('🎉 Migration maxFuelCapacity terminée.');
}

main().catch(console.error);
