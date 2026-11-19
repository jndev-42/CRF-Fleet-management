import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { requireFleetManager } from '@/lib/fleetTracking/access';
import { LINK_TYPES, type LinkType } from '@/lib/fleetTracking/tasks';
import { searchLinkTargets } from '@/lib/fleetTracking/tasksStore';

/**
 * GET /api/fleet-tracking/link-targets?type=VEHICLE|CONTACT|INCIDENT|MAINTENANCE&q=
 * `{ targets }` : objets rattachables à une tâche depuis l'UL de session (véhicules,
 * incidents et maintenances de l'UL ; contacts de l'UL et partagés par d'autres UL).
 * Sans `type`, les quatre types (quelques résultats chacun). `canManageVehicles`.
 */
export async function GET(request: Request) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;

        const params = new URL(request.url).searchParams;
        const rawType = params.get('type');
        if (rawType && !(LINK_TYPES as readonly string[]).includes(rawType)) {
            return NextResponse.json({ error: 'Type de rattachement inconnu' }, { status: 400 });
        }
        const q = (params.get('q') ?? '').trim().slice(0, 100);
        const targets = await searchLinkTargets(access.ulId, (rawType as LinkType | null) || null, q);
        return NextResponse.json({ targets });
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/link-targets error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
