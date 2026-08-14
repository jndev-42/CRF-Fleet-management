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
        const itemId = searchParams.get('itemId');

        if (!itemId) {
            return NextResponse.json({ error: 'ID de l\'article requis' }, { status: 400 });
        }

        const ulId = session.user.ulId || 'default';
        const itemCheck = await db.execute({
            sql: `SELECT ulId FROM "InvItem" WHERE id = ?`,
            args: [itemId],
        });
        if (itemCheck.rows.length === 0 || itemCheck.rows[0].ulId !== ulId) {
            return NextResponse.json({ error: 'Article non trouvé ou accès refusé' }, { status: 404 });
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
