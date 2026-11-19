import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';
import { parseBody, requireFleetManager } from '@/lib/fleetTracking/access';
import { createDossierSchema, dossierFiltersSchema } from '@/lib/fleetTracking/dossiers';
import { createDossier, getDossierDetail, getUlVehicle, listDossiers } from '@/lib/fleetTracking/dossiersStore';
import { searchParamsToObject } from '@/lib/fleetTracking/tasks';

/**
 * GET /api/fleet-tracking/dossiers?status=OPEN|CLOSED&vehicle=<vehicleId>&pinned=1
 * Dossiers de l'UL de session (véhicule et compteurs compris). `canManageVehicles`.
 *
 * POST /api/fleet-tracking/dossiers
 * Ouvre un dossier sur un véhicule de l'UL de session (400 pour un véhicule d'une autre UL).
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

        if (!(await getUlVehicle(access.ulId, parsed.data.vehicleId))) {
            return NextResponse.json({ error: 'Véhicule invalide : introuvable ou hors de votre UL.' }, { status: 400 });
        }
        const id = await createDossier(access.ulId, parsed.data, access.userId);
        const dossier = await getDossierDetail(id, access.ulId, access.session.user.id ?? null);
        return NextResponse.json(dossier ? { success: true, id, dossier } : { success: true, id }, { status: 201 });
    } catch (e: unknown) {
        console.error('POST /api/fleet-tracking/dossiers error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Ouverture d'un dossier de suivi technique", entityType: 'fleetDossier' });
