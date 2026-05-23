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
