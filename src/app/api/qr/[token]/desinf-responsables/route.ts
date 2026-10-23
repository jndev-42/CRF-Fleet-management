import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { listActiveUlMembers } from '@/lib/ulMembers';

/**
 * GET /api/qr/[token]/desinf-responsables
 *
 * Candidats « Responsable de la désinfection » du formulaire de retour par QR code
 * (`src/app/qr/[token]/CheckInForm.tsx`) : comptes actifs de l'UL du véhicule (cf.
 * `listActiveUlMembers`). `GET /api/users` est réservé aux gestionnaires : sans cette
 * route, un chauffeur ne pouvait pas rendre un véhicule après une désinfection.
 *
 * Accès : règles du parcours QR (tout compte connecté sauf INACTIF/GUEST, cf.
 * `isQrBlocked`) ; pas de cloisonnement UL — la possession du QR code fait foi.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return unauthorizedResponse();
    }

    if (isQrBlocked(session.user.roles || [])) {
        return forbiddenResponse('Compte inactif — accès refusé');
    }

    const { token } = await params;

    try {
        const vehicleRes = await db.execute({
            sql: `SELECT ulId FROM Vehicle WHERE qrToken = ?`,
            args: [token],
        });
        if (vehicleRes.rows.length === 0) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        const users = await listActiveUlMembers(vehicleRes.rows[0].ulId);
        return NextResponse.json({ users });
    } catch (error) {
        console.error('Error fetching QR desinfection responsables:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des responsables' }, { status: 500 });
    }
}
