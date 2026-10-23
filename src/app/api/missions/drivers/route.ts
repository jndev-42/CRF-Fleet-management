import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminOrAbove, isInactive } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { listMissionDrivers } from '@/lib/eligibleDrivers';

/** Rôles autorisés à rédiger un rapport de mission — mêmes que `POST /api/missions`. */
const ALLOWED_ROLES = ['ADMIN', 'CI/RPAPS'];

/**
 * GET /api/missions/drivers
 *
 * Chauffeurs proposables à l'étape « Équipage » du rapport de mission (`/missions/new`).
 * `GET /api/users?drivers=true` est réservé aux gestionnaires : un CI/RPAPS y recevait un
 * 403 et la liste restait vide. Population : cf. `listMissionDrivers`.
 *
 * Accès : rédacteurs de rapports (ADMIN et au-dessus, CI/RPAPS) ; compte inactif refusé.
 */
export async function GET() {
    const session = await auth();
    if (!session?.user) {
        return unauthorizedResponse();
    }

    const roles = session.user.roles || [];
    if (isInactive(roles)) {
        return forbiddenResponse('Compte inactif — accès refusé');
    }
    if (!ALLOWED_ROLES.some(r => roles.includes(r)) && !isAdminOrAbove(roles)) {
        return forbiddenResponse();
    }

    try {
        const users = await listMissionDrivers();
        return NextResponse.json({ users });
    } catch (error) {
        console.error('Error fetching mission drivers:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des chauffeurs' }, { status: 500 });
    }
}
