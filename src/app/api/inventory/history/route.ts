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

        const logsRes = await db.execute({
            sql: `SELECT * FROM "InvStockLog" WHERE itemId = ? ORDER BY timestamp DESC LIMIT 100`,
            args: [itemId],
        });

        return NextResponse.json({ logs: logsRes.rows });
    } catch (e) {
        console.error('GET /api/inventory/history error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération de l\'historique' }, { status: 500 });
    }
}
