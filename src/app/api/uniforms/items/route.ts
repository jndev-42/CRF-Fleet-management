import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminOrAbove, isInactive } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { createItem, listCatalog } from '@/lib/uniforms/catalog';
import { uniformErrorResponse } from '@/lib/uniforms/errors';
import { activeUlId, createItemSchema, parseBody } from '@/lib/uniforms/schemas';

/**
 * GET /api/uniforms/items
 * Catalogue de l'UL active (articles, tailles, parc et disponible). Tout compte
 * actif (`!isInactive`) : c'est l'écran d'emprunt de l'appli.
 *
 * POST /api/uniforms/items
 * Crée un article (et ses tailles initiales) dans l'UL active. `isAdminOrAbove`.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isInactive(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const ulId = activeUlId(session.user.ulId);
        if (!ulId) return NextResponse.json({ items: [] });

        return NextResponse.json({ items: await listCatalog(ulId) });
    } catch (e) {
        console.error('GET /api/uniforms/items error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (!isAdminOrAbove(session.user.roles || [])) return forbiddenResponse();

        const parsed = await parseBody(request, createItemSchema);
        if ('response' in parsed) return parsed.response;

        // Cloisonnement : l'article est TOUJOURS créé dans l'UL de session,
        // jamais dans une UL passée par le client.
        const ulId = activeUlId(session.user.ulId);
        if (!ulId) {
            return NextResponse.json({ error: 'Aucune unité locale active' }, { status: 400 });
        }

        const { id } = await createItem(ulId, parsed.data.name, parsed.data.sizes);
        return NextResponse.json({ success: true, id }, { status: 201 });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('POST /api/uniforms/items error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
