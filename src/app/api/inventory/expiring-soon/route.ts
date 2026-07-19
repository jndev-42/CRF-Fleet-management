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
        const stockId = searchParams.get('stockId');

        const oneMonthFromNow = new Date();
        oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
        const limitDate = oneMonthFromNow.toISOString().split('T')[0];

        const ulId = session.user.ulId || 'default';

        const conditions = [
            'b.expiryDate IS NOT NULL',
            'b.expiryDate <= ?',
            'b.quantity > 0',
            'i.ulId = ?'
        ];
        const args: (string | number)[] = [limitDate, ulId];

        if (stockId) {
            conditions.push('i.stockId = ?');
            args.push(stockId);
        }

        // Join InvBatch with InvItem to get names
        const res = await db.execute({
            sql: `
                SELECT
                    b.id as batchId,
                    b.quantity,
                    b.expiryDate,
                    i.id as itemId,
                    i.name as itemName,
                    i.category
                FROM "InvBatch" b
                JOIN "InvItem" i ON b.itemId = i.id
                WHERE ${conditions.join(' AND ')}
                ORDER BY b.expiryDate ASC
            `,
            args,
        });

        return NextResponse.json({ items: res.rows });
    } catch (e) {
        const errorMsg = getErrorMessage(e);
        console.error('GET /api/inventory/expiring-soon error:', errorMsg);
        return NextResponse.json({
            error: 'Erreur lors de la récupération des articles périmés bientôt',
            details: errorMsg
        }, { status: 500 });
    }
}
