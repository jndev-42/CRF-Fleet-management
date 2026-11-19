import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { requireFleetManager } from '@/lib/fleetTracking/access';
import { countControls, parisDay } from '@/lib/fleetTracking/controls';
import { loadUlControls } from '@/lib/fleetTracking/controlsStore';

/**
 * GET /api/fleet-tracking/controls
 * Échéances de contrôle (CT, révision, désinfection VPSP) des véhicules de l'UL de
 * session, calculées depuis les données véhicule, avec leur rendez-vous et leur état,
 * triées par échéance croissante ; `counts` : effectifs de chaque filtre.
 * `canManageVehicles`.
 */
export async function GET() {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;

        const today = parisDay();
        const controls = await loadUlControls(access.ulId, today);
        return NextResponse.json({ today, controls, counts: countControls(controls) });
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/controls error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
