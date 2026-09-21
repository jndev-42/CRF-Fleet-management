import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

/**
 * GET /api/qr-ul/[token]
 *
 * Résout un token QR vers l'UL qui le porte, pour que la page de scan affiche le
 * rattachement avant que le bénévole remplisse son compte rendu.
 *
 * Contrôle d'accès : tout compte CRF connecté, AVEC OU SANS rôle attribué, sauf
 * s'il porte INACTIF (ou GUEST, valeur héritée) — cf. `isQrBlocked`. Aucun filtre
 * d'UL ni de rôle : c'est le bypass QR, identique à `/api/qr/[token]/vehicle` et
 * à `/api/qr-stock/[token]/stock`. La possession du QR fait foi.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return unauthorizedResponse();
    }

    if (isQrBlocked(session.user.roles || [])) {
        return forbiddenResponse('Compte inactif');
    }

    const { token } = await params;

    try {
        const res = await db.execute({
            sql: `SELECT id, name FROM "UniteLocale" WHERE qrToken = ?`,
            args: [token],
        });

        if (res.rows.length === 0) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        return NextResponse.json({
            id: res.rows[0].id as string,
            name: res.rows[0].name as string,
        });
    } catch (error) {
        console.error('Error resolving UL QR token:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
