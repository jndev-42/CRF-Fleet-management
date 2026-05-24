import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getErrorMessage } from '@/lib/utils/error';
import { checkAdminOrForbidden } from '@/lib/utils/auth-server';

export async function POST(request: Request) {
    try {
        const { session, response: forbiddenResponse } = await checkAdminOrForbidden();
        if (forbiddenResponse) return forbiddenResponse;

        const body = await request.json();
        const { itemId, change, note, expiryDate, deductFromNoDate } = body;

        if (!itemId || typeof change !== 'number') {
            return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
        }

        const tx = await db.transaction('write');
        try {
            if (change > 0) {
                // Optional: deduct from no-date batch if specified (splitting stock)
                if (deductFromNoDate && expiryDate) {
                    const noDateBatchRes = await tx.execute({
                        sql: `SELECT id, quantity FROM "InvBatch" WHERE itemId = ? AND expiryDate IS NULL`,
                        args: [itemId],
                    });

                    const noDateBatch = noDateBatchRes.rows[0];
                    if (!noDateBatch || Number(noDateBatch.quantity) < change) {
                        return NextResponse.json({ error: 'Quantité "sans date" insuffisante pour effectuer le découpage' }, { status: 400 });
                    }

                    // Deduct from no-date batch
                    await tx.execute({
                        sql: `UPDATE "InvBatch" SET quantity = quantity - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                        args: [change, noDateBatch.id],
                    });
                }

                // Addition: target specific batch or create new one
                const existingBatchRes = await tx.execute({
                    sql: `SELECT id, quantity FROM "InvBatch" WHERE itemId = ? AND (expiryDate = ? OR (expiryDate IS NULL AND ? IS NULL))`,
                    args: [itemId, expiryDate || null, expiryDate || null],
                });

                if (existingBatchRes.rows.length > 0) {
                    await tx.execute({
                        sql: `UPDATE "InvBatch" SET quantity = quantity + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                        args: [change, existingBatchRes.rows[0].id],
                    });
                } else {
                    await tx.execute({
                        sql: `INSERT INTO "InvBatch" (id, itemId, quantity, expiryDate) VALUES (?, ?, ?, ?)`,
                        args: [crypto.randomUUID(), itemId, change, expiryDate || null],
                    });
                }
            } else if (change < 0) {
                // Withdrawal: FEFO logic
                let remainingToRemove = Math.abs(change);

                // Get all batches for this item, sorted by expiry date (nulls last)
                const batchesRes = await tx.execute({
                    sql: `SELECT id, quantity FROM "InvBatch" WHERE itemId = ? AND quantity > 0 ORDER BY CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END, expiryDate ASC`,
                    args: [itemId],
                });

                for (const batch of batchesRes.rows) {
                    const batchQty = Number(batch.quantity);
                    if (remainingToRemove <= 0) break;

                    if (batchQty <= remainingToRemove) {
                        await tx.execute({
                            sql: `UPDATE "InvBatch" SET quantity = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                            args: [batch.id],
                        });
                        remainingToRemove -= batchQty;
                    } else {
                        await tx.execute({
                            sql: `UPDATE "InvBatch" SET quantity = quantity - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                            args: [remainingToRemove, batch.id],
                        });
                        remainingToRemove = 0;
                    }
                }
            }

            // 1. Update quantity in InvItem (ensure >= 0 and sync with batches)
            const totalBatchQtyRes = await tx.execute({
                sql: `SELECT SUM(quantity) as total FROM "InvBatch" WHERE itemId = ?`,
                args: [itemId],
            });
            const totalQty = Number(totalBatchQtyRes.rows[0].total || 0);

            const updateRes = await tx.execute({
                sql: `UPDATE "InvItem" SET quantity = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                args: [totalQty, itemId],
            });

            if (updateRes.rowsAffected === 0) {
                return NextResponse.json({ error: 'Article non trouvé' }, { status: 404 });
            }

            // 2. Log the change
            await tx.execute({
                sql: `INSERT INTO "InvStockLog" (id, itemId, "change", userName, note) VALUES (?, ?, ?, ?, ?)`,
                args: [crypto.randomUUID(), itemId, change, session.user.name || session.user.email, note || null],
            });

            await tx.commit();

            return NextResponse.json({
                success: true,
                newQuantity: totalQty
            });
        } catch (txError) {
            await tx.rollback();
            throw txError;
        }
    } catch (e) {
        console.error('POST /api/inventory/adjust error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du stock' }, { status: 500 });
    }
}
