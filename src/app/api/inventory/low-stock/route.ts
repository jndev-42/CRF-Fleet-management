import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const ulId = session.user.ulId || 'default';
        const res = await db.execute({
            sql: `
                SELECT id, name, category, quantity, minStock
                FROM "InvItem"
                WHERE minStock IS NOT NULL
                  AND quantity < minStock
                  AND ulId = ?
                ORDER BY (minStock - quantity) DESC, name ASC
            `,
            args: [ulId],
        });

        return NextResponse.json({ items: res.rows });
    } catch (e) {
        console.error('GET /api/inventory/low-stock error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération du stock faible' }, { status: 500 });
    }
}
