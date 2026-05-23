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
    console.log('▶ Creating InvBatch table and migrating existing stock...');

    // 1. Create InvBatch table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvBatch" (
            "id"         TEXT NOT NULL PRIMARY KEY,
            "itemId"     TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE CASCADE,
            "quantity"   INTEGER NOT NULL DEFAULT 0,
            "expiryDate" TEXT, -- ISO date string YYYY-MM-DD
            "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ Table "InvBatch" created');

    // 2. Migrate existing InvItem.quantity to InvBatch
    const itemsRes = await db.execute(`SELECT id, quantity FROM "InvItem" WHERE quantity > 0`);

    let migratedCount = 0;
    for (const row of itemsRes.rows) {
        const itemId = row.id as string;
        const quantity = Number(row.quantity);

        // Check if a default batch already exists for this item to avoid duplicates if re-run
        const existingBatch = await db.execute({
            sql: `SELECT id FROM "InvBatch" WHERE itemId = ? AND expiryDate IS NULL`,
            args: [itemId]
        });

        if (existingBatch.rows.length === 0) {
            await db.execute({
                sql: `INSERT INTO "InvBatch" (id, itemId, quantity, expiryDate) VALUES (?, ?, ?, ?)`,
                args: [crypto.randomUUID(), itemId, quantity, null]
            });
            migratedCount++;
        }
    }

    console.log(`  ✓ Migrated ${migratedCount} items to default batches`);
    console.log('✅ Inventory batches migration completed.');
}

run().catch(e => {
    console.error('❌ Error during migration:', e);
    process.exit(1);
});
