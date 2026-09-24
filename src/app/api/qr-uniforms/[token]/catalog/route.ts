import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { listCatalog } from '@/lib/uniforms/catalog';
import { resolveUlByUniformQrToken } from '@/lib/uniforms/qr-token';

/**
 * GET /api/qr-uniforms/[token]/catalog
 *
 * Résout le token « Uniformes » en UL et renvoie son catalogue.
 *
 * Règle d'accès : tout compte connecté, AVEC OU SANS rôle, sauf INACTIF
 * (`isQrBlocked`). AUCUN filtre de rôle ni d'UL : la possession du QR fait foi,
 * comme `/api/qr-stock/[token]/stock`. Le catalogue est celui de l'UL du token,
 * jamais celui de l'UL de session.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isQrBlocked(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const { token } = await params;
        const ul = await resolveUlByUniformQrToken(token);
        if (!ul) return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });

        return NextResponse.json({ ul, items: await listCatalog(ul.id) });
    } catch (e) {
        console.error('GET /api/qr-uniforms/[token]/catalog error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
