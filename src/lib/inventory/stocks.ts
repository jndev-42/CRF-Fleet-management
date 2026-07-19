import { db } from '@/lib/db';

export interface InvStockListRow {
    id: string;
    name: string;
    ulId: string;
    isDefault: number;
    createdAt: string;
    updatedAt: string;
}

export async function ensureStockTableExists(): Promise<void> {
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

    // Ensure stockId column exists on InvItem
    const invItemCols = await db.execute(`PRAGMA table_info("InvItem")`);
    if (invItemCols?.rows && !invItemCols.rows.some((r: Record<string, unknown>) => r.name === 'stockId')) {
        try {
            await db.execute(`ALTER TABLE "InvItem" ADD COLUMN "stockId" TEXT REFERENCES "InvStockList"("id") ON DELETE CASCADE`);
        } catch (e) {
            console.error('Column stockId might already exist:', e);
        }
    }
}

export async function getOrCreateDefaultStock(ulId: string): Promise<InvStockListRow> {
    await ensureStockTableExists();

    const existingStocks = await db.execute({
        sql: `SELECT * FROM "InvStockList" WHERE ulId = ? ORDER BY isDefault DESC, createdAt ASC`,
        args: [ulId],
    });

    let defaultStock: InvStockListRow;

    if (!existingStocks?.rows || existingStocks.rows.length === 0) {
        const id = crypto.randomUUID();
        const name = 'Stock Principal';
        await db.execute({
            sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES (?, ?, ?, 1)`,
            args: [id, name, ulId],
        });

        const createdRes = await db.execute({
            sql: `SELECT * FROM "InvStockList" WHERE id = ?`,
            args: [id],
        });
        defaultStock = (createdRes?.rows?.[0] as unknown as InvStockListRow) || {
            id,
            name,
            ulId,
            isDefault: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    } else {
        defaultStock = existingStocks.rows[0] as unknown as InvStockListRow;
    }

    // Assign any orphan items with null stockId to default stock
    await db.execute({
        sql: `UPDATE "InvItem" SET stockId = ? WHERE (stockId IS NULL OR stockId = '') AND ulId = ?`,
        args: [defaultStock.id, ulId],
    });

    return defaultStock;
}
