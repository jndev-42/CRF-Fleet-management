import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const userRoles = (session.user.roles ?? []) as string[];
        if (!userRoles.includes('ADMIN')) {
            return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
        }

        const body = await request.json();
        const { itemId, change, note, expiryDate } = body;

        if (!itemId || typeof change !== 'number') {
            return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
        }

        if (change > 0) {
            // Addition: target specific batch or create new one
            const existingBatchRes = await db.execute({
                sql: `SELECT id, quantity FROM "InvBatch" WHERE itemId = ? AND (expiryDate = ? OR (expiryDate IS NULL AND ? IS NULL))`,
                args: [itemId, expiryDate || null, expiryDate || null],
            });

            if (existingBatchRes.rows.length > 0) {
                await db.execute({
                    sql: `UPDATE "InvBatch" SET quantity = quantity + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                    args: [change, existingBatchRes.rows[0].id],
                });
            } else {
                await db.execute({
                    sql: `INSERT INTO "InvBatch" (id, itemId, quantity, expiryDate) VALUES (?, ?, ?, ?)`,
                    args: [crypto.randomUUID(), itemId, change, expiryDate || null],
                });
            }
        } else if (change < 0) {
            // Withdrawal: FEFO logic
            let remainingToRemove = Math.abs(change);

            // Get all batches for this item, sorted by expiry date (nulls last)
            const batchesRes = await db.execute({
                sql: `SELECT id, quantity FROM "InvBatch" WHERE itemId = ? AND quantity > 0 ORDER BY CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END, expiryDate ASC`,
                args: [itemId],
            });

            for (const batch of batchesRes.rows) {
                const batchQty = Number(batch.quantity);
                if (remainingToRemove <= 0) break;

                if (batchQty <= remainingToRemove) {
                    await db.execute({
                        sql: `UPDATE "InvBatch" SET quantity = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                        args: [batch.id],
                    });
                    remainingToRemove -= batchQty;
                } else {
                    await db.execute({
                        sql: `UPDATE "InvBatch" SET quantity = quantity - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                        args: [remainingToRemove, batch.id],
                    });
                    remainingToRemove = 0;
                }
            }
        }

        // 1. Update quantity in InvItem (ensure >= 0 and sync with batches)
        const totalBatchQtyRes = await db.execute({
            sql: `SELECT SUM(quantity) as total FROM "InvBatch" WHERE itemId = ?`,
            args: [itemId],
        });
        const totalQty = Number(totalBatchQtyRes.rows[0].total || 0);

        const updateRes = await db.execute({
            sql: `UPDATE "InvItem" SET quantity = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [totalQty, itemId],
        });

        if (updateRes.rowsAffected === 0) {
            return NextResponse.json({ error: 'Article non trouvé' }, { status: 404 });
        }

        // 2. Log the change
        await db.execute({
            sql: `INSERT INTO "InvStockLog" (id, itemId, "change", userName, note) VALUES (?, ?, ?, ?, ?)`,
            args: [crypto.randomUUID(), itemId, change, session.user.name || session.user.email, note || null],
        });

        return NextResponse.json({
            success: true,
            newQuantity: totalQty
        });
    } catch (e) {
        console.error('POST /api/inventory/adjust error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du stock' }, { status: 500 });
    }
}
