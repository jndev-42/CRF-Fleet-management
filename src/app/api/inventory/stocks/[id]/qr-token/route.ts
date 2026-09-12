import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getErrorMessage } from '@/lib/utils/error';
import { canAccessAdminPanel } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import {
    ensureStockTableExists,
    getOrCreateStockQrToken,
    regenerateStockQrToken,
} from '@/lib/inventory/stocks';

/**
 * GET|POST /api/inventory/stocks/[id]/qr-token
 * Renvoie le token QR du stock, créé à la première demande. Aucune contrainte
 * de rôle — tout membre de l'UL du stock peut imprimer le QR.
 *
 * DELETE /api/inventory/stocks/[id]/qr-token
 * Régénère le token, invalidant les QR déjà imprimés. Réservé aux admins.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Ces trois verbes sont scopés sur l'UL DU STOCK, alors que les routes de
 * consommation `/api/qr-stock/[token]/*` ne le sont pas. Ce n'est pas une
 * incohérence.
 *
 * La décision de conception — « quiconque tient le QR papier peut ajuster,
 * quelle que soit son UL » — porte sur le fait de SCANNER un QR physique. Elle
 * ne porte pas sur le droit d'ÉNUMÉRER les tokens par l'API. Sans ce scope,
 * n'importe quel compte connecté obtiendrait le token de n'importe quel stock
 * de l'organisation en itérant sur les identifiants, c'est-à-dire FABRIQUERAIT
 * l'accès sans jamais voir le QR — silencieusement et sans trace. Toute la
 * conception repose sur « le token est un secret qui peut fuir par accident »,
 * pas sur « le token s'obtient sur demande ».
 *
 * Autrement dit : le QR contourne les rôles et les UL ; l'API qui le fabrique
 * ne les contourne pas.
 *
 * ⚠️ `/api/vehicles/[id]/qr-token` porte le même trou (aucun scope). C'est un
 * écart connu, hors périmètre de cette PR. Ne pas « aligner » cette route-ci
 * en lui retirant son scope : c'est le précédent véhicule qui est en retard.
 */

/**
 * Vérifie que le stock existe ET appartient à l'UL de l'appelant.
 * @returns `'NOT_FOUND'` si le stock n'existe pas, `'FORBIDDEN'` s'il est
 *          ailleurs, `null` si l'accès est légitime.
 */
async function checkStockScope(stockId: string, ulId: string): Promise<'NOT_FOUND' | 'FORBIDDEN' | null> {
    const res = await db.execute({
        sql: `SELECT ulId FROM "InvStockList" WHERE id = ?`,
        args: [stockId],
    });
    if (!res?.rows || res.rows.length === 0) return 'NOT_FOUND';
    if (res.rows[0].ulId !== ulId) return 'FORBIDDEN';
    return null;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const ulId = session.user.ulId || 'default';

        // Hors transaction : cette fonction contient du DDL.
        await ensureStockTableExists();

        const scope = await checkStockScope(id, ulId);
        if (scope === 'NOT_FOUND') {
            return NextResponse.json({ error: 'Stock introuvable' }, { status: 404 });
        }
        if (scope === 'FORBIDDEN') {
            return forbiddenResponse('Ce stock appartient à une autre unité locale');
        }

        const token = await getOrCreateStockQrToken(id);
        if (!token) {
            return NextResponse.json({ error: 'Stock introuvable' }, { status: 404 });
        }

        return NextResponse.json({ token });
    } catch (e) {
        console.error('GET /api/inventory/stocks/[id]/qr-token error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/** Identique au GET — conservé pour la cohérence sémantique, utilisé par la modale. */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    return GET(request, { params });
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const ulId = session.user.ulId || 'default';

        await ensureStockTableExists();

        // Le scope d'UL est contrôlé AVANT le rôle : un admin d'une autre UL
        // n'a pas plus à régénérer ce token qu'à le lire.
        const scope = await checkStockScope(id, ulId);
        if (scope === 'NOT_FOUND') {
            return NextResponse.json({ error: 'Stock introuvable' }, { status: 404 });
        }
        if (scope === 'FORBIDDEN') {
            return forbiddenResponse('Ce stock appartient à une autre unité locale');
        }

        if (!canAccessAdminPanel(session.user.roles || [])) {
            return forbiddenResponse();
        }

        const token = await regenerateStockQrToken(id);
        if (!token) {
            return NextResponse.json({ error: 'Stock introuvable' }, { status: 404 });
        }

        return NextResponse.json({ token });
    } catch (e) {
        console.error('DELETE /api/inventory/stocks/[id]/qr-token error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
