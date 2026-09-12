import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { getErrorMessage } from '@/lib/utils/error';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { ensureStockTableExists, resolveStockByQrToken } from '@/lib/inventory/stocks';
import {
    loadItemBatchStates,
    planStockMovement,
    runStatements,
} from '@/lib/inventory/adjustments';
import type { InStatement } from '@libsql/client';

/**
 * POST /api/qr-stock/[token]/adjust
 *
 * Applique un PANIER de mouvements sur le stock désigné par le token, en
 * tout-ou-rien. Un échec partiel laisserait un inventaire à moitié ajusté que
 * personne ne saurait reconstituer.
 *
 * Règle d'accès : `isQrBlocked` — tout compte connecté, avec ou sans rôle,
 * sauf s'il porte INACTIF. AUCUN filtre d'UL : décision assumée, cf. la route
 * `/stock` voisine.
 */

const movementSchema = z.object({
    itemId: z.string().min(1),
    // Magnitude bornée : sans cela, 25 mouvements à -2 000 000 000 formeraient
    // une requête VALIDE depuis n'importe quel compte connecté. La traçabilité
    // est un contrôle de détection ; l'associer à un rayon de destruction non
    // borné serait un choix, pas une conséquence de la décision d'accès.
    change: z.number().int().min(-10_000).max(10_000).refine(n => n !== 0, 'Le mouvement ne peut pas être nul'),
    expiryDate: z.string().optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    // `.strict()` : `deductFromNoDate` est refusé en 400 plutôt que dépouillé en
    // silence. Le découpage de lot est une opération d'administration, elle n'a
    // pas à passer par un QR anonyme.
    //
    // ⚠️ Conséquence pour le client : le panier porte des champs purement
    // locaux (`key`, `itemName`) qui seraient REJETÉS ici. La page projette donc
    // explicitement avant l'envoi — cf. `CartSummary.tsx`.
}).strict();

const adjustSchema = z.object({
    // Borne à 25 : un bénévole traite souvent 5 à 10 articles d'affilée. La
    // borne tient la durée du verrou d'écriture sous la seconde.
    movements: z.array(movementSchema).min(1).max(25),
}).strict();

export const maxDuration = 30;

export async function POST(
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

        const body = await request.json();
        let parsed: z.infer<typeof adjustSchema>;
        try {
            parsed = adjustSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }
        const { movements } = parsed;

        const { token } = await params;

        // ── Tout ce qui suit est DÉLIBÉRÉMENT hors transaction ───────────────
        // Une transaction d'écriture SQLite verrouille la base ENTIÈRE : sa
        // durée de vie est une indisponibilité en écriture pour toute
        // l'application. Le DDL, la résolution du token et le contrôle
        // d'appartenance n'ont pas à se payer sous ce verrou. Ne pas les y
        // déplacer « pour la cohérence » : ce serait annuler tout le gain.
        await ensureStockTableExists();

        const stock = await resolveStockByQrToken(token);
        if (!stock) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        // Chaque écriture est scopée par l'appartenance au stock résolu : c'est
        // la seule frontière, et elle est vérifiée AVANT d'ouvrir quoi que ce soit.
        const itemIds = [...new Set(movements.map(m => m.itemId))];
        const placeholders = itemIds.map(() => '?').join(', ');
        const membership = await db.execute({
            sql: `SELECT id FROM "InvItem" WHERE stockId = ? AND id IN (${placeholders})`,
            args: [stock.id, ...itemIds],
        });
        if ((membership.rows?.length ?? 0) !== itemIds.length) {
            return NextResponse.json({ error: 'Article non trouvé dans ce stock' }, { status: 404 });
        }

        // `InvStockLog.userName` est NOT NULL : repli explicite, jamais `null`.
        const userName = session.user.name || session.user.email || 'Inconnu';

        const tx = await db.transaction('write');
        try {
            const states = await loadItemBatchStates(tx, itemIds);

            // L'ordre du panier est préservé : le mouvement N part de l'état
            // laissé par N-1. Ne pas paralléliser, ne pas regrouper par article.
            const statements: InStatement[] = [];
            for (const movement of movements) {
                const planned = planStockMovement(states, movement, userName);
                if ('error' in planned) {
                    await tx.rollback();
                    // `NO_DATE_INSUFFICIENT` est inatteignable ici :
                    // `deductFromNoDate` est refusé par `.strict()`.
                    return NextResponse.json({ error: 'Article non trouvé dans ce stock' }, { status: 404 });
                }
                statements.push(...planned.statements);
            }

            await runStatements(tx, statements);
            await tx.commit();
        } catch (e) {
            // Rollback isolé : s'il échoue à son tour (transaction déjà avortée
            // par SQLite), c'est sa propre erreur qui masquerait la cause réelle.
            try {
                await tx.rollback();
            } catch {
                // Transaction déjà close : rien à défaire.
            }
            throw e;
        }

        return NextResponse.json({ success: true, applied: movements.length });
    } catch (e) {
        console.error('POST /api/qr-stock/[token]/adjust error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du stock' }, { status: 500 });
    }
}
