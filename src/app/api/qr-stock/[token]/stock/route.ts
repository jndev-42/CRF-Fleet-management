import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { getErrorMessage } from '@/lib/utils/error';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { resolveStockByQrToken } from '@/lib/inventory/stocks';
import { loadItemBatchStates } from '@/lib/inventory/adjustments';

/**
 * GET /api/qr-stock/[token]/stock
 *
 * Résout un token de QR Code en stock et renvoie ses articles avec leurs lots.
 *
 * Règle d'accès : tout compte connecté, AVEC OU SANS rôle attribué, sauf s'il
 * porte INACTIF (ou GUEST, valeur héritée) — cf. `isQrBlocked`.
 *
 * AUCUN filtre d'UL, ni ici ni sur `/adjust` : c'est la décision de conception
 * de cette fonctionnalité, pas un oubli. Quiconque tient le QR papier peut
 * consulter et ajuster le stock, quelle que soit son unité locale ; la
 * traçabilité nominative dans `InvStockLog` est le garde-fou. Ne pas
 * « harmoniser » avec le scope d'UL de `/api/inventory/stocks/[id]/qr-token`,
 * qui répond à une autre question (fabriquer un token n'est pas le scanner).
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        if (isQrBlocked(session.user.roles || [])) {
            return forbiddenResponse('Compte inactif');
        }

        const { token } = await params;

        const stock = await resolveStockByQrToken(token);
        if (!stock) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        // Aucun filtre `ulId` : le périmètre est le stock désigné par le token.
        const itemsRes = await db.execute({
            sql: `SELECT id, name, category, quantity, minStock FROM "InvItem" WHERE stockId = ? ORDER BY name ASC`,
            args: [stock.id],
        });
        const itemRows = itemsRes.rows ?? [];

        const states = await loadItemBatchStates(db, itemRows.map(r => String(r.id)));

        const items = itemRows.map(row => {
            const id = String(row.id);
            return {
                id,
                name: String(row.name),
                category: (row.category as string | null) ?? null,
                quantity: Number(row.quantity),
                minStock: row.minStock === null ? null : Number(row.minStock),
                // Les lots vides sont chargés (le planificateur en a besoin pour
                // ne pas recréer de doublon) mais ne sont pas affichés.
                batches: (states.get(id)?.batches ?? [])
                    .filter(b => b.quantity > 0)
                    .map(b => ({ expiryDate: b.expiryDate, quantity: b.quantity })),
            };
        });

        return NextResponse.json({ stock: { id: stock.id, name: stock.name }, items });
    } catch (e) {
        console.error('GET /api/qr-stock/[token]/stock error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération du stock' }, { status: 500 });
    }
}
