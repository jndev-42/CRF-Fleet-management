import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';
import { unauthorizedResponse } from '@/lib/apiAuth';

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
                SELECT id, name, category, quantity, minStock
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
