/**
 * POST /api/fleet-tracking/tasks/[id]/attachments — joint UN fichier (multipart,
 * champ `file`) à une tâche de l'UL de session.
 *
 * PDF, JPEG, PNG ou WebP vérifiés par signature binaire (le type déclaré ne fait pas
 * foi), 4 Mo au plus (413). Binaire sur R2 sous
 * `fleet-tracking/{UL}/tasks/{taskId}/` ; ordre d'écriture : R2 puis base, l'objet
 * est nettoyé si l'insertion échoue. Rien n'est écrit sur R2 pour un fichier refusé.
 * Au plus `MAX_ATTACHMENTS_PER_TASK` pièces jointes par tâche (400 au-delà).
 * Logique partagée avec les dossiers : `handleAttachmentUpload`.
 */
import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { ownsResource, requireFleetManager } from '@/lib/fleetTracking/access';
import { handleAttachmentUpload } from '@/lib/fleetTracking/attachmentRoutes';
import { getTaskRow } from '@/lib/fleetTracking/tasksStore';

// Lecture multipart, Buffer et R2 : runtime Node requis.
export const runtime = 'nodejs';
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

async function postHandler(request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;

        const task = await getTaskRow(id);
        if (!task) return NextResponse.json({ error: 'Tâche introuvable' }, { status: 404 });
        if (!ownsResource(access, task.ulId)) return forbiddenResponse('Cette tâche appartient à une autre unité locale');

        return await handleAttachmentUpload(request, access, { type: 'TASK', id });
    } catch (e: unknown) {
        console.error('POST /api/fleet-tracking/tasks/[id]/attachments error:', getErrorMessage(e));
        return NextResponse.json({ error: "Erreur lors de l'enregistrement de la pièce jointe." }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Ajout d'une pièce jointe à une tâche de suivi technique", entityType: 'fleetTask', idParam: 'id' });
