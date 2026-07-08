import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const itemId = searchParams.get('itemId');

        if (!itemId) {
            return NextResponse.json({ error: 'ID de l\'article requis' }, { status: 400 });
        }

        const batchesRes = await db.execute({
            sql: `SELECT * FROM "InvBatch" WHERE itemId = ? AND quantity > 0 ORDER BY CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END, expiryDate ASC`,
            args: [itemId],
        });

        return NextResponse.json({ batches: batchesRes.rows });
    } catch (e) {
        const errorMsg = getErrorMessage(e);
        console.error('GET /api/inventory/batches error:', errorMsg);
        return NextResponse.json({
            error: 'Erreur lors de la récupération des lots',
            details: errorMsg
        }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const userRoles = (session.user.roles ?? []) as string[];
        if (!userRoles.includes('ADMIN')) {
            return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const batchId = searchParams.get('batchId');

        if (!batchId) {
            return NextResponse.json({ error: 'ID du lot requis' }, { status: 400 });
        }

        // Récupérer le lot pour connaître l'itemId et la quantité
        const batchRes = await db.execute({
            sql: `SELECT itemId, quantity FROM "InvBatch" WHERE id = ?`,
            args: [batchId],
        });

        if (batchRes.rows.length === 0) {
            return NextResponse.json({ error: 'Lot non trouvé' }, { status: 404 });
        }

        const { itemId, quantity } = batchRes.rows[0];

        // Supprimer le lot
        await db.execute({
            sql: `DELETE FROM "InvBatch" WHERE id = ?`,
            args: [batchId],
        });

        // Resynchroniser la quantity de l'InvItem
        await db.execute({
            sql: `UPDATE "InvItem" SET quantity = quantity - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [quantity, itemId],
        });

        // Logger la suppression
        await db.execute({
            sql: `INSERT INTO "InvStockLog" (id, itemId, "change", userName, note) VALUES (?, ?, ?, ?, ?)`,
            args: [
                crypto.randomUUID(),
                itemId,
                -Number(quantity),
                session.user.name || session.user.email || 'Inconnu',
                'Lot périmé supprimé',
            ],
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/inventory/batches error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la suppression du lot' }, { status: 500 });
    }
}
