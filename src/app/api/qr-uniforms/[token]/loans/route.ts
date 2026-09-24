import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { createLoanBatch, resolveActor } from '@/lib/uniforms/loans';
import { uniformErrorResponse } from '@/lib/uniforms/errors';
import { resolveUlByUniformQrToken } from '@/lib/uniforms/qr-token';
import { loanSchema, parseBody } from '@/lib/uniforms/schemas';

/**
 * POST /api/qr-uniforms/[token]/loans — valide un panier via le QR d'une UL.
 *
 * `isQrBlocked` seulement : aucun filtre de rôle ni d'UL. Même écriture que
 * l'appli (`createLoanBatch`), seul le catalogue change : celui de l'UL du
 * token. L'emprunt est enregistré au nom du compte connecté.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isQrBlocked(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const parsed = await parseBody(request, loanSchema);
        if ('response' in parsed) return parsed.response;

        const { token } = await params;
        const ul = await resolveUlByUniformQrToken(token);
        if (!ul) return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });

        const borrower = await resolveActor(session.user);
        const result = await createLoanBatch({ ulId: ul.id, borrower, lines: parsed.data.lines, source: 'qr' });
        return NextResponse.json({ success: true, ...result }, { status: 201 });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('POST /api/qr-uniforms/[token]/loans error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
