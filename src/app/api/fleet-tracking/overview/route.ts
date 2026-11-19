import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { requireFleetManager } from '@/lib/fleetTracking/access';
import { loadUlOverview } from '@/lib/fleetTracking/overviewStore';

/**
 * GET /api/fleet-tracking/overview
 * Vue d'ensemble « Le point sur la flotte » de l'UL de session :
 * `{ today, counters, nextActions, nextActionsTotal, priority: { pinned, fallback }, vehicles, tabCounts }`.
 * Agrégats en lecture seule des tâches, dossiers et contrôles. `canManageVehicles`.
 */
export async function GET() {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;

        return NextResponse.json(await loadUlOverview(access.ulId, access.userId));
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/overview error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
