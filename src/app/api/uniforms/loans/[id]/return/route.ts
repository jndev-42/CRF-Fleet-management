import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { resolveActor, returnLoan } from '@/lib/uniforms/loans';
import { uniformErrorResponse } from '@/lib/uniforms/errors';
import { parseBody, returnSchema } from '@/lib/uniforms/schemas';

/**
 * POST /api/uniforms/loans/[id]/return — rend UNE pièce.
 *
 * Uniquement par l'emprunteur : une pièce d'autrui répond 404, indiscernable
 * d'un identifiant inconnu. Aucun tiers — administrateur compris — ne rend à
 * sa place. Garde `isQrBlocked` pour la même raison que `/loans/mine`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isQrBlocked(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const parsed = await parseBody(request, returnSchema);
        if ('response' in parsed) return parsed.response;

        const { id } = await params;
        const actor = await resolveActor(session.user);
        await returnLoan(id, actor.id, {
            returnedClean: parsed.data.returnedClean,
            comment: parsed.data.comment || null,
        });
        return NextResponse.json({ success: true });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('POST /api/uniforms/loans/[id]/return error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
