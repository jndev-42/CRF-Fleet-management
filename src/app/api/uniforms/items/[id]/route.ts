import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { archiveItem, getItemRef, renameItem } from '@/lib/uniforms/catalog';
import { uniformErrorResponse } from '@/lib/uniforms/errors';
import { parseBody, renameItemSchema } from '@/lib/uniforms/schemas';

/**
 * PATCH  /api/uniforms/items/[id] — renomme l'article.
 * DELETE /api/uniforms/items/[id] — archive l'article (409 s'il reste des pièces
 *                                   empruntées) ; l'historique reste intact.
 *
 * `isAdminOrAbove`, cloisonné à l'UL de session (`isOutsideUl` → 403 : l'admin
 * connaît déjà l'existence de l'article, comme sur les routes de maintenance).
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        const roles = session.user.roles || [];
        if (!isAdminOrAbove(roles)) return forbiddenResponse();

        const parsed = await parseBody(request, renameItemSchema);
        if ('response' in parsed) return parsed.response;

        const { id } = await params;
        const item = await getItemRef(id);
        if (!item || item.archived) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 });
        if (isOutsideUl(roles, session.user.ulId, item.ulId)) {
            return forbiddenResponse('Cet article appartient à une autre unité locale');
        }

        await renameItem(id, item.ulId, parsed.data.name);
        return NextResponse.json({ success: true });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('PATCH /api/uniforms/items/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        const roles = session.user.roles || [];
        if (!isAdminOrAbove(roles)) return forbiddenResponse();

        const { id } = await params;
        const item = await getItemRef(id);
        if (!item || item.archived) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 });
        if (isOutsideUl(roles, session.user.ulId, item.ulId)) {
            return forbiddenResponse('Cet article appartient à une autre unité locale');
        }

        await archiveItem(id);
        return NextResponse.json({ success: true });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('DELETE /api/uniforms/items/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
