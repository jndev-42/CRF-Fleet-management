import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isInactive } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { markWashed } from '@/lib/uniforms/laundry';
import { resolveActor } from '@/lib/uniforms/loans';
import { uniformErrorResponse } from '@/lib/uniforms/errors';
import { activeUlId } from '@/lib/uniforms/schemas';

/**
 * POST /api/uniforms/laundry/[loanId] — marque lavée une pièce rendue sale de
 * l'UL active ; elle redevient empruntable. Tout compte actif, pas seulement
 * l'emprunteur : c'est celui qui lave qui déclare. 409 si déjà lavée.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ loanId: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isInactive(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const ulId = activeUlId(session.user.ulId);
        if (!ulId) return NextResponse.json({ error: 'Pièce introuvable' }, { status: 404 });

        const { loanId } = await params;
        await markWashed(loanId, ulId, await resolveActor(session.user));
        return NextResponse.json({ success: true });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('POST /api/uniforms/laundry/[loanId] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
