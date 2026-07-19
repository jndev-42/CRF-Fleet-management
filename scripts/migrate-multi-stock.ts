import { createClient } from '@libsql/client';

const db = createClient({
    url: (process.env.DEV_DB_URL ?? process.env.TURSO_DATABASE_URL ?? 'file:./dev.db').trim(),
    authToken: (process.env.DEV_DB_TOKEN ?? process.env.TURSO_AUTH_TOKEN ?? '').trim(),
});

async function main() {
    console.log('🚀 Running multi-stock database migration...');

    // 1. Create InvStockList table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvStockList" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "name"      TEXT NOT NULL,
            "ulId"      TEXT NOT NULL DEFAULT 'default',
            "isDefault" INTEGER NOT NULL DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ InvStockList table verified');

    // 2. Add stockId column to InvItem if missing
    const cols = await db.execute(`PRAGMA table_info("InvItem")`);
    if (!cols.rows.some(r => r.name === 'stockId')) {
        await db.execute(`ALTER TABLE "InvItem" ADD COLUMN "stockId" TEXT REFERENCES "InvStockList"("id") ON DELETE CASCADE`);
        console.log('  ✓ Added stockId column to InvItem');
    }

    // 3. Find all distinct ulIds in InvItem & InvStockList
    const ulRes = await db.execute(`SELECT DISTINCT ulId FROM "InvItem" WHERE ulId IS NOT NULL UNION SELECT DISTINCT ulId FROM "InvStockList" WHERE ulId IS NOT NULL`);
    const uls = Array.from(new Set([...ulRes.rows.map(r => r.ulId as string), 'default', 'ul-paris-18']));

    for (const ulId of uls) {
        const stocksRes = await db.execute({
            sql: `SELECT * FROM "InvStockList" WHERE ulId = ? ORDER BY isDefault DESC, createdAt ASC`,
            args: [ulId],
        });

        let defaultStockId: string;
        if (stocksRes.rows.length === 0) {
            defaultStockId = crypto.randomUUID();
            await db.execute({
                sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES (?, ?, ?, 1)`,
                args: [defaultStockId, 'Stock Principal', ulId],
            });
            console.log(`  ✓ Created default stock for UL: ${ulId}`);
        } else {
            defaultStockId = stocksRes.rows[0].id as string;
        }

        const updateRes = await db.execute({
            sql: `UPDATE "InvItem" SET stockId = ? WHERE (stockId IS NULL OR stockId = '') AND ulId = ?`,
            args: [defaultStockId, ulId],
        });
        if (updateRes.rowsAffected > 0) {
            console.log(`  ✓ Assigned ${updateRes.rowsAffected} items to default stock for UL: ${ulId}`);
        }
    }

    console.log('🎉 Multi-stock migration completed successfully!');
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
