import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canAccessAdminPanel, isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { getOrCreateUniformQrToken, regenerateUniformQrToken } from '@/lib/uniforms/qr-token';
import { activeUlId } from '@/lib/uniforms/schemas';

/**
 * GET|POST /api/uniforms/qr-token
 * Token QR « Uniformes » de l'UL de SESSION, créé à la première demande.
 * `canAccessAdminPanel` (modèle `/api/ul/[id]/qr-token`).
 *
 * DELETE /api/uniforms/qr-token
 * Régénère le token (invalide les QR déjà imprimés). `canAccessAdminPanel`.
 *
 * Modèle `/api/inventory/stocks/[id]/qr-token` :
 *  - l'UL n'est jamais passée par le client — on ne fabrique que le token de
 *    son UL active. Le QR contourne les rôles et les UL ; l'API qui le
 *    fabrique ne les contourne pas ;
 *  - `isQrBlocked` AVANT toute lecture : `getOrCreateUniformQrToken` écrit le
 *    token s'il manque, et un token est un secret transmissible — un compte
 *    INACTIF ne doit ni le lire, ni le régénérer (`canAccessAdminPanel` seul
 *    est satisfait par `['ADMIN','INACTIF']`).
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        const roles = session.user.roles || [];
        if (isQrBlocked(roles)) return forbiddenResponse('Compte inactif');
        // Le token est un secret transmissible et sa lecture le crée : réservé,
        // comme la régénération, aux profils du panneau d'administration.
        if (!canAccessAdminPanel(roles)) return forbiddenResponse();

        const ulId = activeUlId(session.user.ulId);
        if (!ulId) return NextResponse.json({ error: 'UL introuvable' }, { status: 404 });

        const token = await getOrCreateUniformQrToken(ulId);
        if (!token) return NextResponse.json({ error: 'UL introuvable' }, { status: 404 });
        return NextResponse.json({ token });
    } catch (e) {
        console.error('GET /api/uniforms/qr-token error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/** Identique au GET — hérite de TOUTES ses gardes. Utilisé par la modale. */
export async function POST() {
    return GET();
}

export async function DELETE() {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        const roles = session.user.roles || [];
        if (isQrBlocked(roles)) return forbiddenResponse('Compte inactif');
        if (!canAccessAdminPanel(roles)) return forbiddenResponse();

        const ulId = activeUlId(session.user.ulId);
        if (!ulId) return NextResponse.json({ error: 'UL introuvable' }, { status: 404 });

        const token = await regenerateUniformQrToken(ulId);
        if (!token) return NextResponse.json({ error: 'UL introuvable' }, { status: 404 });
        return NextResponse.json({ token });
    } catch (e) {
        console.error('DELETE /api/uniforms/qr-token error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
