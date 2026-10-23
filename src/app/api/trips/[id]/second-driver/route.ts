import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { z } from 'zod';
import { canManageVehicles } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { isLicenseBlocked, OTHER_DRIVER_LICENSE_BLOCKED_MESSAGE } from '@/lib/licenseGuard';

const updateSecondDriverSchema = z.object({
    secondDriverId: z.string().min(1, 'L\'identifiant du 2ème conducteur est requis'),
});

async function patchHandler(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const body = await request.json();
        const data = updateSecondDriverSchema.parse(body);

        // Verify if user is admin or is the primary driver for this trip
        const tripRes = await db.execute({
            sql: `SELECT t.driverId, t.secondDriverId, v.ulId AS vehicleUlId
                  FROM Trip t LEFT JOIN Vehicle v ON v.id = t.vehicleId
                  WHERE t.id = ?`,
            args: [id]
        });

        if (tripRes.rows.length === 0) {
            return NextResponse.json({ error: 'Trajet non trouvé' }, { status: 404 });
        }

        const roles = session.user.roles || [];
        const isAdmin = canManageVehicles(roles);
        const isPrimaryDriver = session.user.id === tripRes.rows[0].driverId;

        // Cloisonnement UL des gestionnaires. Le conducteur principal garde la main sur
        // son propre trajet, y compris pris par QR sur un véhicule d'une autre UL.
        if (!isPrimaryDriver && isOutsideUl(roles, session.user.ulId, tripRes.rows[0].vehicleUlId)) {
            return NextResponse.json({ error: 'Trajet non trouvé' }, { status: 404 });
        }

        if (!isAdmin && !isPrimaryDriver) {
            return forbiddenResponse('Non autorisé à modifier ce trajet');
        }

        // Verify the secondDriver user exists
        const userRes = await db.execute({
            sql: `SELECT id FROM "User" WHERE id = ?`,
            args: [data.secondDriverId]
        });
        if (userRes.rows.length === 0) {
            return NextResponse.json({ error: 'Utilisateur 2ème conducteur introuvable' }, { status: 404 });
        }

        // Comme `trips/[id]/checkout` : seul un second conducteur nouvellement désigné
        // est contrôlé, celui déjà en place n'est pas recontrôlé.
        if (data.secondDriverId !== tripRes.rows[0].secondDriverId && await isLicenseBlocked(data.secondDriverId)) {
            return forbiddenResponse(OTHER_DRIVER_LICENSE_BLOCKED_MESSAGE);
        }

        await db.execute({
            sql: `UPDATE Trip SET secondDriverId = ? WHERE id = ?`,
            args: [data.secondDriverId, id]
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Error updating second driver:', error);
        return NextResponse.json(
            { error: "Erreur lors de l'ajout du 2ème conducteur" },
            { status: 500 }
        );
    }
}

export const PATCH = withAudit(patchHandler, { action: "Modification du second conducteur d'un trajet", entityType: 'trip' });
