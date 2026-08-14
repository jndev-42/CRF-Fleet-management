import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';
import { isAdminOrAbove } from '@/lib/roles';
import { getOrCreateDefaultStock } from '@/lib/inventory/stocks';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

const createStockSchema = z.object({
    name: z.string().min(1),
});

const renameStockSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
});

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const ulId = session.user.ulId || 'default';
        await getOrCreateDefaultStock(ulId);

        const stocksRes = await db.execute({
            sql: `SELECT * FROM "InvStockList" WHERE ulId = ? ORDER BY isDefault DESC, createdAt ASC`,
            args: [ulId],
        });

        return NextResponse.json({ stocks: stocksRes.rows });
    } catch (e) {
        console.error('GET /api/inventory/stocks error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération des stocks' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const userRoles = (session.user.roles ?? []) as string[];
        if (!isAdminOrAbove(userRoles)) {
            return forbiddenResponse();
        }

        const body = await request.json();
        let parsed: z.infer<typeof createStockSchema>;
        try {
            parsed = createStockSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Le nom du stock est requis', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }
        const { name } = parsed;
        if (!name.trim()) {
            return NextResponse.json({ error: 'Le nom du stock est requis' }, { status: 400 });
        }

        const ulId = session.user.ulId || 'default';
        await getOrCreateDefaultStock(ulId);

        const id = crypto.randomUUID();
        const stockName = name.trim();

        await db.execute({
            sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES (?, ?, ?, 0)`,
            args: [id, stockName, ulId],
        });

        return NextResponse.json({ id, name: stockName, ulId, isDefault: 0 }, { status: 201 });
    } catch (e) {
        console.error('POST /api/inventory/stocks error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la création du stock' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const userRoles = (session.user.roles ?? []) as string[];
        if (!isAdminOrAbove(userRoles)) {
            return forbiddenResponse();
        }

        const body = await request.json();
        let parsed: z.infer<typeof renameStockSchema>;
        try {
            parsed = renameStockSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Identifiant et nom valides requis', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }
        const { id, name } = parsed;
        if (!name.trim()) {
            return NextResponse.json({ error: 'Identifiant et nom valides requis' }, { status: 400 });
        }

        const ulId = session.user.ulId || 'default';
        const stockName = name.trim();

        const res = await db.execute({
            sql: `UPDATE "InvStockList" SET name = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND ulId = ?`,
            args: [stockName, id, ulId],
        });

        if (res.rowsAffected === 0) {
            return NextResponse.json({ error: 'Stock introuvable' }, { status: 404 });
        }

        return NextResponse.json({ id, name: stockName });
    } catch (e) {
        console.error('PATCH /api/inventory/stocks error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors du renommage du stock' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const userRoles = (session.user.roles ?? []) as string[];
        if (!isAdminOrAbove(userRoles)) {
            return forbiddenResponse();
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const ulId = session.user.ulId || 'default';

        if (!id) {
            return NextResponse.json({ error: 'Identifiant du stock requis' }, { status: 400 });
        }

        // Count total stocks
        const countRes = await db.execute({
            sql: `SELECT COUNT(*) as count FROM "InvStockList" WHERE ulId = ?`,
            args: [ulId],
        });

        if (Number(countRes.rows[0].count) <= 1) {
            return NextResponse.json({ error: 'Impossible de supprimer le dernier stock' }, { status: 400 });
        }

        // Verify ownership
        const stockCheck = await db.execute({
            sql: `SELECT id, isDefault FROM "InvStockList" WHERE id = ? AND ulId = ?`,
            args: [id, ulId],
        });

        if (stockCheck.rows.length === 0) {
            return NextResponse.json({ error: 'Stock introuvable' }, { status: 404 });
        }

        // Cascading deletion of batches, logs, items, and the stock list entry
        await db.execute({
            sql: `DELETE FROM "InvBatch" WHERE itemId IN (SELECT id FROM "InvItem" WHERE stockId = ?)`,
            args: [id],
        });

        await db.execute({
            sql: `DELETE FROM "InvStockLog" WHERE itemId IN (SELECT id FROM "InvItem" WHERE stockId = ?)`,
            args: [id],
        });

        await db.execute({
            sql: `DELETE FROM "InvItem" WHERE stockId = ?`,
            args: [id],
        });

        await db.execute({
            sql: `DELETE FROM "InvStockList" WHERE id = ? AND ulId = ?`,
            args: [id, ulId],
        });

        // If the deleted stock was the default stock, make another stock default
        if (Number(stockCheck.rows[0].isDefault) === 1) {
            const nextStock = await db.execute({
                sql: `SELECT id FROM "InvStockList" WHERE ulId = ? ORDER BY createdAt ASC LIMIT 1`,
                args: [ulId],
            });
            if (nextStock.rows.length > 0) {
                await db.execute({
                    sql: `UPDATE "InvStockList" SET isDefault = 1 WHERE id = ?`,
                    args: [nextStock.rows[0].id],
                });
            }
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/inventory/stocks error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la suppression du stock' }, { status: 500 });
    }
}
