import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canAccessAdminPanel } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { listUlLoans } from '@/lib/uniforms/loans';
import { activeUlId } from '@/lib/uniforms/schemas';

/**
 * GET /api/uniforms/loans/ul?status=open|all — qui a emprunté quoi.
 *
 * `canAccessAdminPanel`. Filtré sur `UniformItem.ulId = UL de session`, quel
 * que soit l'UL de l'emprunteur : le cadre de l'UL 18 voit le secouriste de
 * l'UL 4 qui a emprunté des pièces de l'UL 18, et rien des pièces de l'UL 4.
 * `truncated` signale que seules les lignes les plus récentes sont renvoyées.
 */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (!canAccessAdminPanel(session.user.roles || [])) return forbiddenResponse();

        const ulId = activeUlId(session.user.ulId);
        if (!ulId) return NextResponse.json({ loans: [], truncated: false });

        const status = new URL(request.url).searchParams.get('status') === 'open' ? 'open' : 'all';
        return NextResponse.json(await listUlLoans(ulId, status));
    } catch (e) {
        console.error('GET /api/uniforms/loans/ul error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
