import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { getErrorMessage } from '@/lib/utils/error';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { resolveStockByQrToken } from '@/lib/inventory/stocks';
import { loadItemBatchStates } from '@/lib/inventory/adjustments';

const QR_STOCK_DEFAULT_LIMIT = 30;

const querySchema = z.object({
    q: z.string().trim().max(100).optional(),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(QR_STOCK_DEFAULT_LIMIT),
});

/** Minuscules, sans diacritiques : « Stérile » et « sterile » se valent. */
function normalize(value: string): string {
    return value
        .toLowerCase()
        .replace(/œ/g, 'oe')
        .replace(/æ/g, 'ae')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * GET /api/qr-stock/[token]/stock?q=&offset=&limit=
 *
 * Résout un token de QR Code en stock et renvoie une page de ses articles avec
 * leurs lots. `q` filtre (nom et catégorie, sans casse ni accents) sur TOUT le
 * stock, pas seulement sur ce qui a déjà été chargé. Réponse :
 * `{ stock, items, total, hasMore }`.
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
    request: Request,
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

        const { searchParams } = new URL(request.url);
        const parsed = querySchema.safeParse({
            q: searchParams.get('q') ?? undefined,
            offset: searchParams.get('offset') ?? undefined,
            limit: searchParams.get('limit') ?? undefined,
        });
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Paramètres invalides', details: parsed.error.issues },
                { status: 400 }
            );
        }
        const { q, offset, limit } = parsed.data;

        // Aucun filtre `ulId` : le périmètre est le stock désigné par le token.
        // Colonnes légères seulement : ce sont les lots, chargés plus bas pour la
        // page uniquement, qui coûtent.
        const itemsRes = await db.execute({
            sql: `SELECT id, name, category, quantity, minStock FROM "InvItem" WHERE stockId = ? ORDER BY name ASC, id ASC`,
            args: [stock.id],
        });
        let itemRows = itemsRes.rows ?? [];

        // Filtre en JS : le `LIKE` de SQLite ignore la casse ASCII seulement et
        // jamais les accents, ce qui est gênant en français.
        const needle = q ? normalize(q) : '';
        if (needle) {
            itemRows = itemRows.filter(r =>
                normalize(String(r.name)).includes(needle) ||
                normalize(String(r.category ?? '')).includes(needle)
            );
        }

        const total = itemRows.length;
        const pageRows = itemRows.slice(offset, offset + limit);
        const hasMore = offset + pageRows.length < total;

        const states = await loadItemBatchStates(db, pageRows.map(r => String(r.id)));

        const items = pageRows.map(row => {
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

        return NextResponse.json({ stock: { id: stock.id, name: stock.name }, items, total, hasMore });
    } catch (e) {
        console.error('GET /api/qr-stock/[token]/stock error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération du stock' }, { status: 500 });
    }
}
