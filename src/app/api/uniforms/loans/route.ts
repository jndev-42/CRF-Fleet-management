import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isInactive } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { createLoanBatch, resolveActor } from '@/lib/uniforms/loans';
import { uniformErrorResponse } from '@/lib/uniforms/errors';
import { activeUlId, loanSchema, parseBody } from '@/lib/uniforms/schemas';

/**
 * POST /api/uniforms/loans — valide un panier depuis l'appli.
 *
 * Tout compte actif (`!isInactive`). Le catalogue est celui de l'UL ACTIVE :
 * une taille d'une autre UL répond 404 comme une taille inconnue. Le panier est
 * tout-ou-rien — 409 si une taille n'a plus assez de disponible au moment de la
 * validation, aucune ligne créée (cf. `createLoanBatch`).
 */
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isInactive(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const parsed = await parseBody(request, loanSchema);
        if ('response' in parsed) return parsed.response;

        const ulId = activeUlId(session.user.ulId);
        if (!ulId) return NextResponse.json({ error: 'Aucune unité locale active' }, { status: 400 });

        const borrower = await resolveActor(session.user);
        const result = await createLoanBatch({ ulId, borrower, lines: parsed.data.lines, source: 'app' });
        return NextResponse.json({ success: true, ...result }, { status: 201 });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('POST /api/uniforms/loans error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
