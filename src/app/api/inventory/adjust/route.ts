import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';
import { isAdminOrAbove } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { loadItemBatchStates, planStockMovement } from '@/lib/inventory/adjustments';

const adjustSchema = z.object({
    itemId: z.string().min(1),
    change: z.number(),
    note: z.string().optional().nullable(),
    expiryDate: z.string().optional().nullable(),
    deductFromNoDate: z.boolean().optional(),
});

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const userRoles = (session.user.roles ?? []) as string[];
        if (!isAdminOrAbove(userRoles)) {
            return forbiddenResponse();
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
        const { itemId, change, note, expiryDate, deductFromNoDate } = parsed;

        const ulId = session.user.ulId || 'default';
        const itemCheck = await db.execute({
            sql: `SELECT ulId FROM "InvItem" WHERE id = ?`,
            args: [itemId],
        });
        if (itemCheck.rows.length === 0 || itemCheck.rows[0].ulId !== ulId) {
            return NextResponse.json({ error: 'Article non trouvé ou accès refusé' }, { status: 404 });
        }

        // La logique de mouvement vit dans `src/lib/inventory/adjustments.ts`, partagée
        // avec la route QR : lecture groupée des lots, planification pure, puis envoi
        // des écritures en un seul paquet. La resynchronisation de `InvItem.quantity`
        // y est une sous-requête corrélée, donc juste même si un lot est inséré par un
        // écrivain concurrent entre la lecture et l'écriture — ce que la version
        // précédente, qui relisait un `SUM` puis le réécrivait, ne garantissait pas.
        const states = await loadItemBatchStates(db, [itemId]);
        const planned = planStockMovement(
            states,
            { itemId, change, note, expiryDate, deductFromNoDate },
            session.user.name || session.user.email || null,
        );

        if ('error' in planned) {
            if (planned.error === 'NO_DATE_INSUFFICIENT') {
                return NextResponse.json({ error: 'Quantité "sans date" insuffisante pour effectuer le découpage' }, { status: 400 });
            }
            // Traduction de l'ancien `rowsAffected === 0` : inatteignable ici, le
            // contrôle d'UL ci-dessus ayant déjà prouvé l'existence de l'article.
            return NextResponse.json({ error: 'Article non trouvé' }, { status: 404 });
        }

        await db.batch(planned.statements, 'write');

        return NextResponse.json({
            success: true,
            // Total PRÉVU par le planificateur, et non celui que la base vient
            // d'écrire (sous-requête corrélée). Les deux ne divergent que si un
            // écrivain concurrent s'est intercalé, auquel cas la base a raison et
            // la réponse est périmée d'un rafraîchissement. Acceptable pour un
            // champ d'affichage (`src/app/inventory/page.tsx` le pose sur la
            // ligne) ; ne pas en déduire une décision.
            newQuantity: planned.newQuantity
        });
    } catch (e) {
        console.error('POST /api/inventory/adjust error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du stock' }, { status: 500 });
    }
}
