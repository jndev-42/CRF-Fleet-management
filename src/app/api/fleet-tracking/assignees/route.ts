import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { requireFleetManager } from '@/lib/fleetTracking/access';
import { listAssignableManagers } from '@/lib/fleetTracking/tasksStore';

/**
 * GET /api/fleet-tracking/assignees
 * `{ assignees }` : responsables véhicule et admins actifs de l'UL de session — les
 * seules personnes à qui une tâche peut être attribuée. `canManageVehicles`.
 */
export async function GET() {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        return NextResponse.json({ assignees: await listAssignableManagers(access.ulId) });
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/assignees error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
