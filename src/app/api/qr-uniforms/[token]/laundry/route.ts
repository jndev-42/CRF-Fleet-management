import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { listLaundry } from '@/lib/uniforms/laundry';
import { resolveUlByUniformQrToken } from '@/lib/uniforms/qr-token';

/**
 * GET /api/qr-uniforms/[token]/laundry — liste « À laver » de l'UL du token.
 * `isQrBlocked` seulement.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isQrBlocked(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const { token } = await params;
        const ul = await resolveUlByUniformQrToken(token);
        if (!ul) return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });

        return NextResponse.json({ pieces: await listLaundry(ul.id) });
    } catch (e) {
        console.error('GET /api/qr-uniforms/[token]/laundry error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
