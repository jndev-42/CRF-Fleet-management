import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { listEligibleDrivers } from '@/lib/eligibleDrivers';

/**
 * GET /api/qr/[token]/drivers
 *
 * Liste des 2èmes conducteurs proposables à l'emprunt par QR code (cf.
 * `listEligibleDrivers` : chauffeurs habilités au type du véhicule, toutes UL, hors
 * INACTIF et hors utilisateur courant).
 *
 * Accès : mêmes règles que le reste du parcours QR (tout compte CRF connecté sauf
 * INACTIF, cf. `isQrBlocked`). `GET /api/users` est réservé aux gestionnaires : cette
 * route n'expose donc que le strict nécessaire au choix (id, nom, email).
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
            sql: `SELECT type FROM Vehicle WHERE qrToken = ?`,
            args: [token],
        });
        if (vehicleRes.rows.length === 0) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        const users = await listEligibleDrivers(vehicleRes.rows[0].type, session.user.id ?? '');
        return NextResponse.json({ users });
    } catch (error) {
        console.error('Error fetching QR drivers:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des conducteurs' }, { status: 500 });
    }
}
