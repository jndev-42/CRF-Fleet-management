import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { forbiddenResponse } from '@/lib/apiAuth';
import { db } from '@/lib/db';
import { requireFleetManager } from '@/lib/fleetTracking/access';
import { getVehicleHistory } from '@/lib/fleetTracking/dossiersStore';

type Context = { params: Promise<{ name: string }> };

/**
 * GET /api/fleet-tracking/vehicles/[name]/history — historique technique d'un
 * véhicule (désigné par son NOM, comme la fiche `/vehicles/[id]`) : ses dossiers
 * ouverts et clos, et ses tâches hors dossier, du plus récent au plus ancien.
 * `canManageVehicles` ; véhicule inconnu → 404 ; véhicule d'une autre UL → 403.
 */
export async function GET(_request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { name } = await params;

        // Le nom n'est pas unique entre UL : d'abord le véhicule de l'UL de session ; le
        // nom seul ne sert qu'à distinguer 403 (autre UL) de 404 (inconnu).
        const own = await db.execute({ sql: `SELECT id, name, ulId FROM "Vehicle" WHERE name = ? AND ulId = ?`, args: [name, access.ulId] });
        const vehicle = own.rows[0];
        if (!vehicle) {
            const any = await db.execute({ sql: `SELECT 1 FROM "Vehicle" WHERE name = ? LIMIT 1`, args: [name] });
            return any.rows.length
                ? forbiddenResponse('Ce véhicule appartient à une autre unité locale')
                : NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 });
        }

        const entries = await getVehicleHistory(access.ulId, String(vehicle.id), access.session.user.id ?? null);
        return NextResponse.json({ vehicle: { id: String(vehicle.id), name: String(vehicle.name) }, entries });
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/vehicles/[name]/history error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
