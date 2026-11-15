import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';
import { canManageInventory } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';

const orderedSchema = z.object({
    itemId: z.string().min(1),
    ordered: z.boolean(),
});

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(request.url);
        const stockId = searchParams.get('stockId');
        const ulId = session.user.ulId || 'default';

        const conditions = ['minStock IS NOT NULL', 'quantity < minStock', 'ulId = ?'];
        const args: (string | number)[] = [ulId];

        if (stockId) {
            conditions.push('stockId = ?');
            args.push(stockId);
        }

        const res = await db.execute({
            sql: `
                SELECT id, name, category, quantity, minStock, orderedAt
                FROM "InvItem"
                WHERE ${conditions.join(' AND ')}
                ORDER BY (minStock - quantity) DESC, name ASC
            `,
            args,
        });

        return NextResponse.json({ items: res.rows });
    } catch (e) {
        console.error('GET /api/inventory/low-stock error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération du stock faible' }, { status: 500 });
    }
}

async function patchHandler(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const userRoles = (session.user.roles ?? []) as string[];
        if (!canManageInventory(userRoles)) {
            return forbiddenResponse();
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
        }
        const parsed = orderedSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 });
        }

        const { itemId, ordered } = parsed.data;
        const ulId = session.user.ulId || 'default';

        // Purement visuel : ni quantity, ni updatedAt, ni lots, ni historique.
        const res = await db.execute({
            sql: `UPDATE "InvItem" SET orderedAt = ${ordered ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = ? AND ulId = ?`,
            args: [itemId, ulId],
        });

        if (res.rowsAffected === 0) {
            return NextResponse.json({ error: 'Article non trouvé ou accès refusé' }, { status: 404 });
        }

        const row = await db.execute({
            sql: `SELECT orderedAt FROM "InvItem" WHERE id = ? AND ulId = ?`,
            args: [itemId, ulId],
        });
        return NextResponse.json({ orderedAt: row.rows[0]?.orderedAt ?? null });
    } catch (e) {
        console.error('PATCH /api/inventory/low-stock error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors du marquage de l\'article' }, { status: 500 });
    }
}

export const PATCH = withAudit(patchHandler, { action: "Marquage « commandé » d'un article en stock faible", entityType: 'inventoryItem' });
