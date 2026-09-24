import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminOrAbove } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { addSize, getItemRef } from '@/lib/uniforms/catalog';
import { uniformErrorResponse } from '@/lib/uniforms/errors';
import { parseBody, sizeInputSchema } from '@/lib/uniforms/schemas';

/**
 * POST /api/uniforms/items/[id]/sizes — ajoute une taille (libellé + quantité
 * possédée) à un article. `isAdminOrAbove`, cloisonné à l'UL de session.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        const roles = session.user.roles || [];
        if (!isAdminOrAbove(roles)) return forbiddenResponse();

        const parsed = await parseBody(request, sizeInputSchema);
        if ('response' in parsed) return parsed.response;

        const { id } = await params;
        const item = await getItemRef(id);
        if (!item || item.archived) return NextResponse.json({ error: 'Article introuvable' }, { status: 404 });
        if (isOutsideUl(roles, session.user.ulId, item.ulId)) {
            return forbiddenResponse('Cet article appartient à une autre unité locale');
        }

        const size = await addSize(id, parsed.data.label, parsed.data.quantity);
        return NextResponse.json({ success: true, id: size.id }, { status: 201 });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('POST /api/uniforms/items/[id]/sizes error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
