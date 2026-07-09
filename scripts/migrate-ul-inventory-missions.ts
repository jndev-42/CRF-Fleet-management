import { createClient } from '@libsql/client';
import "dotenv/config";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
    console.error('❌ TURSO_DATABASE_URL must be set');
    process.exit(1);
}

const db = createClient({ url, authToken });

async function run() {
    console.log('▶ Migrating inventory and mission_reports to support UL segmentation...');

    // 1. Add ulId column to InvItem if not exists
    const invItemInfo = await db.execute(`PRAGMA table_info("InvItem")`);
    if (!invItemInfo.rows.some(r => r.name === 'ulId')) {
        await db.execute(`ALTER TABLE "InvItem" ADD COLUMN "ulId" TEXT`);
        console.log('  ✓ Column "ulId" added to "InvItem"');
        
        const updateInv = await db.execute(`UPDATE "InvItem" SET "ulId" = 'ul-paris-18'`);
        console.log(`  ✓ Backfilled ${updateInv.rowsAffected} InvItem rows with 'ul-paris-18'`);
    }

    // 2. Add ulId column to mission_reports if not exists
    const missionInfo = await db.execute(`PRAGMA table_info("mission_reports")`);
    if (!missionInfo.rows.some(r => r.name === 'ulId')) {
        await db.execute(`ALTER TABLE "mission_reports" ADD COLUMN "ulId" TEXT`);
        console.log('  ✓ Column "ulId" added to "mission_reports"');

        const updateMissionsDefault = await db.execute(`UPDATE "mission_reports" SET "ulId" = 'ul-paris-18'`);
        console.log(`  ✓ Backfilled ${updateMissionsDefault.rowsAffected} mission_reports rows with 'ul-paris-18'`);

        // Populate ulId based on vehicle's ulId where possible
        const updateRes = await db.execute(`
            UPDATE "mission_reports"
            SET "ulId" = (SELECT v."ulId" FROM "Vehicle" v WHERE v.id = "mission_reports".vehicle_id)
            WHERE vehicle_id IS NOT NULL AND EXISTS (SELECT 1 FROM "Vehicle" v WHERE v.id = "mission_reports".vehicle_id)
        `);
        console.log(`  ✓ Updated ${updateRes.rowsAffected} mission_reports with vehicle's ulId`);
    }

    console.log('✅ UL inventory and missions migration completed.');
}

run().catch(e => {
    console.error('❌ Error during migration:', e);
    process.exit(1);
});
