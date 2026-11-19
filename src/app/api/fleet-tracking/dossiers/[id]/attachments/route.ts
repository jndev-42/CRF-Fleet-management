/**
 * POST /api/fleet-tracking/dossiers/[id]/attachments — joint UN fichier (multipart,
 * champ `file`) à un dossier de l'UL de session.
 *
 * Mêmes règles que les pièces jointes de tâche (`handleAttachmentUpload`) : PDF,
 * JPEG, PNG ou WebP par signature binaire, 4 Mo au plus (413), au plus 20 par
 * dossier ; R2 sous `fleet-tracking/{UL}/dossiers/{dossierId}/` puis base.
 */
import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';
import { requireFleetManager } from '@/lib/fleetTracking/access';
import { handleAttachmentUpload } from '@/lib/fleetTracking/attachmentRoutes';
import { loadOwnedDossier } from '@/lib/fleetTracking/dossierGuards';

// Lecture multipart, Buffer et R2 : runtime Node requis.
export const runtime = 'nodejs';
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

async function postHandler(request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;
        const owned = await loadOwnedDossier(access, id);
        if (!owned.ok) return owned.response;

        return await handleAttachmentUpload(request, access, { type: 'DOSSIER', id });
    } catch (e: unknown) {
        console.error('POST /api/fleet-tracking/dossiers/[id]/attachments error:', getErrorMessage(e));
        return NextResponse.json({ error: "Erreur lors de l'enregistrement de la pièce jointe." }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Ajout d'une pièce jointe à un dossier de suivi technique", entityType: 'fleetDossier', idParam: 'id' });
