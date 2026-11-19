import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';
import { parseBody, requireFleetManager } from '@/lib/fleetTracking/access';
import { createItemSchema, MAX_DOSSIER_ITEMS } from '@/lib/fleetTracking/dossiers';
import { DOSSIER_NOT_FOUND, loadOwnedDossier } from '@/lib/fleetTracking/dossierGuards';
import { countItems, createItem, getItem } from '@/lib/fleetTracking/dossiersStore';

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/fleet-tracking/dossiers/[id]/items — ajoute une pièce à récupérer
 * (non reçue) en fin de liste. Au plus `MAX_DOSSIER_ITEMS` par dossier (400).
 */
async function postHandler(request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;

        const parsed = await parseBody(request, createItemSchema);
        if ('response' in parsed) return parsed.response;

        const owned = await loadOwnedDossier(access, id);
        if (!owned.ok) return owned.response;
        if (await countItems(id) >= MAX_DOSSIER_ITEMS) {
            return NextResponse.json({ error: `Un dossier compte au plus ${MAX_DOSSIER_ITEMS} pièces à récupérer.` }, { status: 400 });
        }

        const itemId = await createItem(id, access.ulId, parsed.data.label);
        if (!itemId) return DOSSIER_NOT_FOUND();
        const item = await getItem(id, itemId);
        return NextResponse.json({ success: true, id: itemId, item }, { status: 201 });
    } catch (e: unknown) {
        console.error('POST /api/fleet-tracking/dossiers/[id]/items error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Ajout d'une pièce à récupérer à un dossier de suivi technique", entityType: 'fleetDossier', idParam: 'id' });
