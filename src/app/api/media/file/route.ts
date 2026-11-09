/**
 * GET /api/media/file?key=<clé R2> — renvoie un fichier média (photo, rapport signé).
 *
 * La clé est validée (pas de `..`, type connu, forme attendue) puis rattachée à son
 * enregistrement : 3 premiers segments pour les photos, clé exacte pour le rapport
 * de mission signé. Content-Type déduit de l'extension, cache privé.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canAccessMediaKey } from '@/lib/media/access';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { displayNameOfKey, mimeTypeOfKey, validateMediaKey } from '@/lib/media/refs';

export const runtime = 'nodejs';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const key = new URL(request.url).searchParams.get('key');
        if (!key || !validateMediaKey(key)) {
            return NextResponse.json({ error: 'Paramètre key invalide' }, { status: 400 });
        }

        if (!(await canAccessMediaKey(session, key))) {
            return forbiddenResponse();
        }

        const { getObject } = await import('@/lib/r2');
        const body = await getObject(key);
        if (!body) {
            return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 });
        }

        const fileName = displayNameOfKey(key).replace(/"/g, '');
        return new Response(new Uint8Array(body), {
            status: 200,
            headers: {
                'Content-Type': mimeTypeOfKey(key),
                'Content-Length': String(body.length),
                'Content-Disposition': `inline; filename="${fileName}"`,
                'Cache-Control': 'private, max-age=3600',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error: unknown) {
        console.error('[GET /api/media/file]', getErrorMessage(error));
        return NextResponse.json({ error: 'Erreur lors de la lecture du fichier' }, { status: 500 });
    }
}
