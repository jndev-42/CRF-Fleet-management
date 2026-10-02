import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { resolveActor, returnBatch } from '@/lib/uniforms/loans';
import { uniformErrorResponse } from '@/lib/uniforms/errors';
import { parseBody, returnSchema } from '@/lib/uniforms/schemas';
import { withAudit } from '@/lib/audit/log';

/**
 * POST /api/uniforms/loan-batches/[id]/return — « Tout rendre ».
 *
 * Rend toutes les pièces RESTANTES d'un emprunt validé, avec le même état
 * (propre/sale) et le même commentaire. Mêmes règles que le rendu unitaire :
 * emprunteur uniquement, 404 indiscernable pour autrui.
 */
async function postHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isQrBlocked(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const parsed = await parseBody(request, returnSchema);
        if ('response' in parsed) return parsed.response;

        const { id } = await params;
        const actor = await resolveActor(session.user);
        const returned = await returnBatch(id, actor.id, {
            returnedClean: parsed.data.returnedClean,
            comment: parsed.data.comment || null,
        });
        return NextResponse.json({ success: true, returned });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('POST /api/uniforms/loan-batches/[id]/return error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Retour d'un lot d'uniformes prêtés", entityType: 'uniformLoanBatch' });
