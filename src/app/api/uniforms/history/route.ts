import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canManageUniforms } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { listUlHistory } from '@/lib/uniforms/history';
import { activeUlId, historyQuerySchema } from '@/lib/uniforms/schemas';

/**
 * GET /api/uniforms/history?type=all|loan|return|wash&q=…&cursor=… — journal
 * des emprunts, rendus et lavages, 50 événements par page (`hasMore`,
 * `nextCursor`).
 *
 * `canManageUniforms` (admin ou responsable uniforme). Filtré sur
 * `UniformItem.ulId = UL de session`, quelle que soit l'UL de l'emprunteur.
 */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (!canManageUniforms(session.user.roles || [])) return forbiddenResponse();

        const params = new URL(request.url).searchParams;
        const parsed = historyQuerySchema.safeParse({
            type: params.get('type') ?? undefined,
            q: params.get('q') ?? undefined,
            cursor: params.get('cursor') ?? undefined,
        });
        if (!parsed.success) {
            return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.issues }, { status: 400 });
        }

        const ulId = activeUlId(session.user.ulId);
        if (!ulId) return NextResponse.json({ events: [], nextCursor: null, hasMore: false });

        return NextResponse.json(await listUlHistory(ulId, parsed.data));
    } catch (e) {
        console.error('GET /api/uniforms/history error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
