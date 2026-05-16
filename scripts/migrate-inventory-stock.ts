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
    console.log('▶ Reworking inventory schema for stock management...');

    // 1. Add quantity column to InvItem if not exists
    const invItemInfo = await db.execute(`PRAGMA table_info("InvItem")`);
    if (!invItemInfo.rows.some(r => r.name === 'quantity')) {
        await db.execute(`ALTER TABLE "InvItem" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 0`);
        console.log('  ✓ Column "quantity" added to "InvItem"');
    }

    // 2. Create InvStockLog table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvStockLog" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "itemId"    TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE CASCADE,
            "change"    INTEGER NOT NULL,
            "userName"  TEXT NOT NULL,
            "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "note"      TEXT
        )
    `);
    console.log('  ✓ Table "InvStockLog" created');

    console.log('✅ Inventory schema rework completed.');
}

run().catch(e => {
    console.error('❌ Error during migration:', e);
    process.exit(1);
});
