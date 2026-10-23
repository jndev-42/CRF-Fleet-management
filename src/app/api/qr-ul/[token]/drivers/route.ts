import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { listMissionDrivers } from '@/lib/eligibleDrivers';

/**
 * GET /api/qr-ul/[token]/drivers
 *
 * Chauffeurs proposables à l'étape « Équipage » du rapport de mission déposé par QR code
 * d'UL (`/qr-ul/[token]`). Cette page est ouverte à tout compte connecté : sans cette
 * route, elle appelait `GET /api/users?drivers=true` (réservé aux gestionnaires) et la
 * liste restait vide. Population : cf. `listMissionDrivers`.
 *
 * Accès : règles QR — tout compte connecté sauf INACTIF/GUEST (`isQrBlocked`).
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
        return forbiddenResponse('Compte inactif');
    }

    const { token } = await params;

    try {
        const ulRes = await db.execute({
            sql: `SELECT id FROM "UniteLocale" WHERE qrToken = ?`,
            args: [token],
        });
        if (ulRes.rows.length === 0) {
            return NextResponse.json({ error: 'QR Code invalide ou expiré' }, { status: 404 });
        }

        const users = await listMissionDrivers();
        return NextResponse.json({ users });
    } catch (error) {
        console.error('Error fetching UL QR mission drivers:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des chauffeurs' }, { status: 500 });
    }
}
