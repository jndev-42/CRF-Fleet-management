import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isInactive } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { listEligibleDrivers } from '@/lib/eligibleDrivers';

/**
 * GET /api/vehicles/[id]/drivers
 *
 * 2èmes conducteurs proposables dans la modale d'emprunt de la fiche véhicule (cf.
 * `listEligibleDrivers`). `GET /api/users` est réservé aux gestionnaires : un chauffeur
 * qui empruntait voyait donc une liste vide.
 *
 * Accès : tout compte actif. Cloisonnement UL identique à `POST /api/trips` (on ne
 * peut emprunter que dans son UL) : refus en 404, indiscernable d'un identifiant inconnu.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user) {
        return unauthorizedResponse();
    }

    const roles = session.user.roles || [];
    if (isInactive(roles)) {
        return forbiddenResponse('Compte inactif — accès refusé');
    }

    const { id } = await params;

    try {
        const vehicleRes = await db.execute({
            sql: `SELECT type, ulId FROM Vehicle WHERE id = ?`,
            args: [id],
        });
        const vehicle = vehicleRes.rows[0];
        if (!vehicle || isOutsideUl(roles, session.user.ulId, vehicle.ulId)) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }

        const users = await listEligibleDrivers(vehicle.type, session.user.id ?? '');
        return NextResponse.json({ users });
    } catch (error) {
        console.error('Error fetching vehicle drivers:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des conducteurs' }, { status: 500 });
    }
}
