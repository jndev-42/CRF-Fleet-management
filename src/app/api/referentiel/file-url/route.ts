/**
 * GET /api/referentiel/file-url — URL signée (1 h) de lecture du PDF actif.
 *
 * La liseuse lit le PDF directement sur R2 par requêtes `Range` : on ne
 * télécharge jamais le fichier entier, et il ne passe pas par Vercel.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { presignUrl } from '@/lib/r2';
import { getReadyReferentiel, READ_URL_TTL_SEC } from '@/lib/referentiel/repository';

export const runtime = 'nodejs';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isQrBlocked(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const active = await getReadyReferentiel();
        if (!active) return NextResponse.json({ error: 'Aucun référentiel importé' }, { status: 404 });

        const url = await presignUrl(active.r2Key, 'GET', READ_URL_TTL_SEC);
        return NextResponse.json({ url, fileName: active.fileName, pageCount: active.pageCount });
    } catch (e: unknown) {
        console.error('GET /api/referentiel/file-url error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
