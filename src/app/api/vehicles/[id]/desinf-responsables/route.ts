import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isInactive } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { listActiveUlMembers } from '@/lib/ulMembers';

/**
 * GET /api/vehicles/[id]/desinf-responsables
 *
 * Candidats « Responsable de la désinfection » de la modale de retour (`CheckInModal`) :
 * comptes actifs de l'UL du véhicule (cf. `listActiveUlMembers`). `GET /api/users` est
 * réservé aux gestionnaires : un chauffeur y recevait un 403, la liste restait vide et
 * le retour d'une mission « Désinfection » (responsable obligatoire) était impossible.
 *
 * Accès : tout compte actif ; véhicule cloisonné à l'UL de l'appelant (404 sinon,
 * indiscernable d'un identifiant inconnu). `[id]` est l'UUID du véhicule.
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
            sql: `SELECT ulId FROM Vehicle WHERE id = ?`,
            args: [id],
        });
        const vehicle = vehicleRes.rows[0];
        if (!vehicle || isOutsideUl(roles, session.user.ulId, vehicle.ulId)) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }

        const users = await listActiveUlMembers(vehicle.ulId);
        return NextResponse.json({ users });
    } catch (error) {
        console.error('Error fetching desinfection responsables:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des responsables' }, { status: 500 });
    }
}
