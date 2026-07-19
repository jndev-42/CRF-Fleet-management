import { createClient } from '@libsql/client';
import "dotenv/config";

const url = process.env.TURSO_DATABASE_URL || 'file:./dev.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

async function run() {
    console.log('▶ Starting UL default parking spots migration...');

    // 1. Ensure column defaultParkingSpots exists on UniteLocale
    const tableInfo = await db.execute(`PRAGMA table_info("UniteLocale")`);
    if (!tableInfo.rows.some(r => r.name === 'defaultParkingSpots')) {
        await db.execute(`ALTER TABLE "UniteLocale" ADD COLUMN "defaultParkingSpots" TEXT`);
        console.log('  ✓ Column "defaultParkingSpots" added to "UniteLocale"');
    } else {
        console.log('  ✓ Column "defaultParkingSpots" already exists on "UniteLocale"');
    }

    // 2. Seed Paris 18 (ul-paris-18) if defaultParkingSpots is NULL or empty
    const p18ParkingSpots = JSON.stringify([
        "Baigneur (devant l'UL)",
        "Parking Aubervilliers"
    ]);

    await db.execute({
        sql: `UPDATE "UniteLocale" SET defaultParkingSpots = ? WHERE id = 'ul-paris-18' AND (defaultParkingSpots IS NULL OR defaultParkingSpots = '')`,
        args: [p18ParkingSpots]
    });
    console.log('  ✓ Updated Paris 18 (ul-paris-18) default parking spots');

    console.log('✅ UL default parking spots migration completed.');
}

run().catch(e => {
    console.error('❌ Error during migration:', e);
    process.exit(1);
});
