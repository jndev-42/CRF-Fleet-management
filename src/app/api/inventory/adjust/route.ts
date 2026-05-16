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
        const { itemId, change, note } = body;

        if (!itemId || typeof change !== 'number') {
            return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
        }

        // 1. Update quantity in InvItem (ensure >= 0)
        const updateRes = await db.execute({
            sql: `UPDATE "InvItem" SET quantity = MAX(0, quantity + ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [change, itemId],
        });

        if (updateRes.rowsAffected === 0) {
            return NextResponse.json({ error: 'Article non trouvé' }, { status: 404 });
        }

        // 2. Log the change
        await db.execute({
            sql: `INSERT INTO "InvStockLog" (id, itemId, "change", userName, note) VALUES (?, ?, ?, ?, ?)`,
            args: [crypto.randomUUID(), itemId, change, session.user.name || session.user.email, note || null],
        });

        // 3. Get new quantity
        const itemRes = await db.execute({
            sql: `SELECT quantity FROM "InvItem" WHERE id = ?`,
            args: [itemId],
        });

        return NextResponse.json({
            success: true,
            newQuantity: Number(itemRes.rows[0].quantity)
        });
    } catch (e) {
        console.error('POST /api/inventory/adjust error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du stock' }, { status: 500 });
    }
}
