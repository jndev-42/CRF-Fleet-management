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
    console.log('▶ Migrating Notification table to support UL segmentation...');

    // 1. Add ulId column to Notification if not exists
    const tableInfo = await db.execute(`PRAGMA table_info("Notification")`);
    if (!tableInfo.rows.some(r => r.name === 'ulId')) {
        await db.execute(`ALTER TABLE "Notification" ADD COLUMN "ulId" TEXT`);
        console.log('  ✓ Column "ulId" added to "Notification"');
        
        // 2. Backfill existing notifications with user's home UL or fallback to 'ul-paris-18'
        const updateRes = await db.execute(`
            UPDATE "Notification"
            SET "ulId" = COALESCE(
                (SELECT uu."ulId" FROM "UserUL" uu WHERE uu."userId" = "Notification"."userId" AND uu."is_home" = 1),
                (SELECT uu."ulId" FROM "UserUL" uu WHERE uu."userId" = "Notification"."userId" LIMIT 1),
                'ul-paris-18'
            )
            WHERE "ulId" IS NULL
        `);
        console.log(`  ✓ Backfilled ${updateRes.rowsAffected} notifications with their user's active/home UL`);
    } else {
        console.log('  ✓ Column "ulId" already exists in "Notification"');
    }

    console.log('✅ Notification UL segmentation migration completed.');
}

run().catch(e => {
    console.error('❌ Error during migration:', e);
    process.exit(1);
});
