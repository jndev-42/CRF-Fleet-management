import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isInactive } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { listLaundry } from '@/lib/uniforms/laundry';
import { activeUlId } from '@/lib/uniforms/schemas';

/**
 * GET /api/uniforms/laundry — pièces rendues sales, pas encore lavées, des
 * articles de l'UL active. Tout compte actif.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isInactive(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const ulId = activeUlId(session.user.ulId);
        if (!ulId) return NextResponse.json({ pieces: [] });

        return NextResponse.json({ pieces: await listLaundry(ulId) });
    } catch (e) {
        console.error('GET /api/uniforms/laundry error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
