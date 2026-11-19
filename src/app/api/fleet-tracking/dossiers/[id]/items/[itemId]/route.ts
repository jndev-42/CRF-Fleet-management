import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';
import { parseBody, requireFleetManager } from '@/lib/fleetTracking/access';
import { updateItemSchema } from '@/lib/fleetTracking/dossiers';
import { loadOwnedDossier } from '@/lib/fleetTracking/dossierGuards';
import { deleteItem, getItem, getItemState, isDossierAttachment, updateItem } from '@/lib/fleetTracking/dossiersStore';

type Context = { params: Promise<{ id: string; itemId: string }> };

const ITEM_NOT_FOUND = () => NextResponse.json({ error: 'Pièce à récupérer introuvable' }, { status: 404 });

/**
 * PATCH /api/fleet-tracking/dossiers/[id]/items/[itemId]
 * `received: true` pose la date et l'auteur de réception ; `receivedValue` et
 * `attachmentId` (une pièce jointe DE CE dossier, sinon 400) ne s'enregistrent que
 * sur une pièce reçue (400 sinon). `received: false` efface valeur, fichier, date et
 * auteur ; la pièce jointe reste dans le dossier.
 */
async function patchHandler(request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id, itemId } = await params;

        const parsed = await parseBody(request, updateItemSchema);
        if ('response' in parsed) return parsed.response;

        const owned = await loadOwnedDossier(access, id);
        if (!owned.ok) return owned.response;
        const state = await getItemState(id, itemId);
        if (!state) return ITEM_NOT_FOUND();

        const input = parsed.data;
        const receivedAfter = input.received ?? state.received;
        if (!receivedAfter && ((input.receivedValue ?? null) !== null || (input.attachmentId ?? null) !== null)) {
            return NextResponse.json({ error: 'Une pièce non reçue n\'a ni valeur ni fichier : marquez-la reçue.' }, { status: 400 });
        }
        if (input.attachmentId && !(await isDossierAttachment(id, input.attachmentId))) {
            return NextResponse.json({ error: 'Fichier invalide : la pièce jointe doit appartenir à ce dossier.' }, { status: 400 });
        }

        const result = await updateItem(id, itemId, state, input, access.session.user.id ?? null);
        if (result === 'missing') return ITEM_NOT_FOUND();
        if (result === 'invalid-attachment') {
            return NextResponse.json({ error: 'Fichier invalide : la pièce jointe doit appartenir à ce dossier.' }, { status: 400 });
        }
        const item = await getItem(id, itemId);
        if (!item) return ITEM_NOT_FOUND();
        return NextResponse.json({ success: true, item });
    } catch (e: unknown) {
        console.error('PATCH /api/fleet-tracking/dossiers/[id]/items/[itemId] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/** DELETE /api/fleet-tracking/dossiers/[id]/items/[itemId] — retire la pièce (son fichier reste dans le dossier). */
async function deleteHandler(_request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id, itemId } = await params;
        const owned = await loadOwnedDossier(access, id);
        if (!owned.ok) return owned.response;

        if (!(await deleteItem(id, itemId))) return ITEM_NOT_FOUND();
        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        console.error('DELETE /api/fleet-tracking/dossiers/[id]/items/[itemId] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const PATCH = withAudit(patchHandler, { action: "Modification d'une pièce à récupérer de suivi technique", entityType: 'fleetDossierItem', idParam: 'itemId' });
export const DELETE = withAudit(deleteHandler, { action: "Suppression d'une pièce à récupérer de suivi technique", entityType: 'fleetDossierItem', idParam: 'itemId' });
