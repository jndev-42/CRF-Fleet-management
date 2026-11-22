import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';
import { parseBody, requireFleetManager } from '@/lib/fleetTracking/access';
import { createDossierSchema, dossierFiltersSchema } from '@/lib/fleetTracking/dossiers';
import { checkDossierVehicles } from '@/lib/fleetTracking/dossierGuards';
import { createDossier, getDossierDetail, listDossiers } from '@/lib/fleetTracking/dossiersStore';
import { searchParamsToObject } from '@/lib/fleetTracking/tasks';

/**
 * GET /api/fleet-tracking/dossiers?status=OPEN|CLOSED (OPEN = ouverts : tout sauf clos)&vehicle=<vehicleId>&pinned=1
 * Dossiers de l'UL de session (véhicules et compteurs compris) ; `vehicle` : dossiers
 * portant ce véhicule. `canManageVehicles`.
 *
 * POST /api/fleet-tracking/dossiers
 * Ouvre un dossier sur un ou plusieurs véhicules de l'UL de session (`vehicleIds` ;
 * l'ancienne forme `vehicleId` reste acceptée). 400 pour un véhicule d'une autre UL.
 */
export async function GET(request: Request) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;

        const parsed = dossierFiltersSchema.safeParse(searchParamsToObject(new URL(request.url).searchParams));
        if (!parsed.success) {
            return NextResponse.json({ error: `Filtre invalide : ${parsed.error.issues[0]?.message ?? ''}`.trim() }, { status: 400 });
        }
        const dossiers = await listDossiers(access.ulId, parsed.data);
        return NextResponse.json({ dossiers });
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/dossiers error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

async function postHandler(request: Request) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;

        const parsed = await parseBody(request, createDossierSchema);
        if ('response' in parsed) return parsed.response;

        const invalid = await checkDossierVehicles(access.ulId, parsed.data.vehicleIds);
        if (invalid) return invalid;
        const id = await createDossier(access.ulId, parsed.data, access.userId);
        const dossier = await getDossierDetail(id, access.ulId, access.session.user.id ?? null);
        return NextResponse.json(dossier ? { success: true, id, dossier } : { success: true, id }, { status: 201 });
    } catch (e: unknown) {
        console.error('POST /api/fleet-tracking/dossiers error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Ouverture d'un dossier de suivi technique", entityType: 'fleetDossier' });
