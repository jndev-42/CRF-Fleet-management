import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { markWashed } from '@/lib/uniforms/laundry';
import { resolveActor } from '@/lib/uniforms/loans';
import { uniformErrorResponse } from '@/lib/uniforms/errors';
import { resolveUlByUniformQrToken } from '@/lib/uniforms/qr-token';

/**
 * POST /api/qr-uniforms/[token]/laundry/[loanId] — marque lavée une pièce sale
 * de l'UL du token. `isQrBlocked` seulement ; une pièce d'une autre UL répond
 * 404. 409 si déjà lavée.
 */
export async function POST(
    _request: Request,
    { params }: { params: Promise<{ token: string; loanId: string }> },
) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isQrBlocked(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const { token, loanId } = await params;
        const ul = await resolveUlByUniformQrToken(token);
        if (!ul) return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });

        await markWashed(loanId, ul.id, await resolveActor(session.user));
        return NextResponse.json({ success: true });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('POST /api/qr-uniforms/[token]/laundry/[loanId] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
