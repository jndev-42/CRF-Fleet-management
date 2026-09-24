import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { archiveSize, getSizeRef, updateSize } from '@/lib/uniforms/catalog';
import { uniformErrorResponse } from '@/lib/uniforms/errors';
import { parseBody, updateSizeSchema } from '@/lib/uniforms/schemas';

/**
 * PATCH  /api/uniforms/items/[id]/sizes/[sizeId] — modifie libellé et/ou quantité possédée.
 * DELETE /api/uniforms/items/[id]/sizes/[sizeId] — archive la taille (409 s'il
 *                                                 reste des pièces empruntées).
 *
 * `isAdminOrAbove`, cloisonné à l'UL de session. Réduire la quantité sous le
 * nombre de pièces sorties est permis : c'est une correction de parc, le
 * disponible affiché est simplement borné à zéro.
 */
type RouteContext = { params: Promise<{ id: string; sizeId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        const roles = session.user.roles || [];
        if (!isAdminOrAbove(roles)) return forbiddenResponse();

        const parsed = await parseBody(request, updateSizeSchema);
        if ('response' in parsed) return parsed.response;

        const { id, sizeId } = await params;
        const size = await getSizeRef(id, sizeId);
        if (!size || size.archived) return NextResponse.json({ error: 'Taille introuvable' }, { status: 404 });
        if (isOutsideUl(roles, session.user.ulId, size.ulId)) {
            return forbiddenResponse('Cet article appartient à une autre unité locale');
        }

        await updateSize(id, sizeId, parsed.data);
        return NextResponse.json({ success: true });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('PATCH /api/uniforms/items/[id]/sizes/[sizeId] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        const roles = session.user.roles || [];
        if (!isAdminOrAbove(roles)) return forbiddenResponse();

        const { id, sizeId } = await params;
        const size = await getSizeRef(id, sizeId);
        if (!size || size.archived) return NextResponse.json({ error: 'Taille introuvable' }, { status: 404 });
        if (isOutsideUl(roles, session.user.ulId, size.ulId)) {
            return forbiddenResponse('Cet article appartient à une autre unité locale');
        }

        await archiveSize(sizeId);
        return NextResponse.json({ success: true });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('DELETE /api/uniforms/items/[id]/sizes/[sizeId] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
