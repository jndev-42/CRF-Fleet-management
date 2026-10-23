import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isQrBlocked } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

/**
 * GET /api/qr/[token]/drivers
 *
 * Liste des 2èmes conducteurs proposables à l'emprunt par QR code : chauffeurs habilités
 * au type du véhicule (CHVPSP pour un VPSP, CHVL sinon), toutes unités locales
 * confondues, hors comptes INACTIF et hors utilisateur courant.
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

        const isVPSP = String(vehicleRes.rows[0].type || '').toUpperCase().includes('VPSP');
        const driverRole = isVPSP ? 'CHVPSP' : 'CHVL';

        const usersRes = await db.execute({
            sql: `SELECT u.id, u.name, u.email
                  FROM "User" u
                  WHERE u.id IN (
                      SELECT ur.userId FROM "UserRole" ur
                      JOIN "Role" r ON ur.roleId = r.id
                      WHERE r.name = ?
                  )
                  AND u.id NOT IN (
                      SELECT ur.userId FROM "UserRole" ur
                      JOIN "Role" r ON ur.roleId = r.id
                      WHERE r.name = 'INACTIF'
                  )
                  AND u.id != ?
                  ORDER BY COALESCE(u.name, u.email) COLLATE NOCASE ASC`,
            args: [driverRole, session.user.id ?? ''],
        });

        const users = usersRes.rows.map(row => ({
            id: row.id as string,
            name: (row.name as string | null) ?? null,
            email: row.email as string,
        }));

        return NextResponse.json({ users });
    } catch (error) {
        console.error('Error fetching QR drivers:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des conducteurs' }, { status: 500 });
    }
}
