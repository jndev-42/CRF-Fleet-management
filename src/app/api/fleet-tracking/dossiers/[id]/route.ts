import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';
import { parseBody, requireFleetManager } from '@/lib/fleetTracking/access';
import { updateDossierSchema } from '@/lib/fleetTracking/dossiers';
import { checkDossierVehicles, DOSSIER_NOT_FOUND, loadOwnedDossier } from '@/lib/fleetTracking/dossierGuards';
import { deleteDossier, getDossierDetail, updateDossier } from '@/lib/fleetTracking/dossiersStore';

// La suppression efface aussi les pièces jointes sur R2.
export const runtime = 'nodejs';
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

/** GET /api/fleet-tracking/dossiers/[id] — dossier enrichi (pièces à récupérer, tâches, pièces jointes). */
export async function GET(_request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;
        const owned = await loadOwnedDossier(access, id);
        if (!owned.ok) return owned.response;

        const dossier = await getDossierDetail(id, access.ulId, access.session.user.id ?? null);
        if (!dossier) return DOSSIER_NOT_FOUND();
        return NextResponse.json({ dossier });
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/dossiers/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/**
 * PATCH /api/fleet-tracking/dossiers/[id]
 * Modification partielle (titre, description, épingle, état, véhicules). `vehicleIds`
 * remplace la liste des véhicules (au moins un) : chacun doit être de l'UL, ou déjà
 * porté par le dossier. `vehicleId` seul → 400.
 * Clore pose `closedAt`, rouvrir l'efface ; clore ne supprime rien.
 */
async function patchHandler(request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;

        const parsed = await parseBody(request, updateDossierSchema);
        if ('response' in parsed) return parsed.response;

        const owned = await loadOwnedDossier(access, id);
        if (!owned.ok) return owned.response;

        if (parsed.data.vehicleIds) {
            const invalid = await checkDossierVehicles(access.ulId, parsed.data.vehicleIds, owned.row.vehicleIds);
            if (invalid) return invalid;
        }

        if (!(await updateDossier(id, access.ulId, owned.row, parsed.data))) return DOSSIER_NOT_FOUND();

        const dossier = await getDossierDetail(id, access.ulId, access.session.user.id ?? null);
        if (!dossier) return DOSSIER_NOT_FOUND();
        return NextResponse.json({ success: true, dossier });
    } catch (e: unknown) {
        console.error('PATCH /api/fleet-tracking/dossiers/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/**
 * DELETE /api/fleet-tracking/dossiers/[id] — dossier, pièces à récupérer et pièces
 * jointes (base puis R2) ; ses tâches sont conservées et détachées.
 */
async function deleteHandler(_request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;
        const owned = await loadOwnedDossier(access, id);
        if (!owned.ok) return owned.response;

        if (!(await deleteDossier(id, access.ulId))) return DOSSIER_NOT_FOUND();
        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        console.error('DELETE /api/fleet-tracking/dossiers/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const PATCH = withAudit(patchHandler, { action: "Modification d'un dossier de suivi technique", entityType: 'fleetDossier', idParam: 'id' });
export const DELETE = withAudit(deleteHandler, { action: "Suppression d'un dossier de suivi technique", entityType: 'fleetDossier', idParam: 'id' });
