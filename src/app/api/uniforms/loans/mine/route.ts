import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { listMyOpenLoans, resolveActor } from '@/lib/uniforms/loans';
import { uniformErrorResponse } from '@/lib/uniforms/errors';

/**
 * GET /api/uniforms/loans/mine — pièces non rendues de l'utilisateur, groupées
 * par emprunt. Alimente le bandeau global.
 *
 * Garde `isQrBlocked` et non `isInactive` : un bénévole SANS rôle peut emprunter
 * via le QR d'une UL, il doit donc pouvoir voir et rendre ce qu'il détient.
 * Seul un compte portant INACTIF est refusé.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (isQrBlocked(session.user.roles || [])) return forbiddenResponse('Compte inactif');

        const actor = await resolveActor(session.user);
        return NextResponse.json({ batches: await listMyOpenLoans(actor.id) });
    } catch (e) {
        const known = uniformErrorResponse(e);
        if (known) return known;
        console.error('GET /api/uniforms/loans/mine error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
