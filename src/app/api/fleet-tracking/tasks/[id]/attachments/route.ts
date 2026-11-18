/**
 * POST /api/fleet-tracking/tasks/[id]/attachments — joint UN fichier (multipart,
 * champ `file`) à une tâche de l'UL de session.
 *
 * PDF, JPEG, PNG ou WebP vérifiés par signature binaire (le type déclaré ne fait pas
 * foi), 4 Mo au plus (413). Binaire sur R2 sous
 * `fleet-tracking/{UL}/tasks/{taskId}/` ; ordre d'écriture : R2 puis base, l'objet
 * est nettoyé si l'insertion échoue. Rien n'est écrit sur R2 pour un fichier refusé.
 * Au plus `MAX_ATTACHMENTS_PER_TASK` pièces jointes par tâche (400 au-delà).
 */
import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { ownsResource, requireFleetManager } from '@/lib/fleetTracking/access';
import {
    ATTACHMENT_INVALID_ERROR,
    ATTACHMENT_TOO_LARGE_ERROR,
    buildTaskAttachmentKey,
    detectAttachmentKind,
    MAX_ATTACHMENT_SIZE,
    MAX_ATTACHMENTS_PER_TASK,
    TOO_MANY_ATTACHMENTS_ERROR,
    sanitizeAttachmentFileName,
} from '@/lib/fleetTracking/attachments';
import { countTaskAttachments, getTaskRow, insertAttachment } from '@/lib/fleetTracking/tasksStore';

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
        if (await countTaskAttachments(id) >= MAX_ATTACHMENTS_PER_TASK) {
            return NextResponse.json({ error: TOO_MANY_ATTACHMENTS_ERROR }, { status: 400 });
        }

        let formData: FormData;
        try {
            formData = await request.formData();
        } catch {
            return NextResponse.json({ error: 'Requête invalide : un fichier est attendu.' }, { status: 400 });
        }
        const file = formData.get('file');
        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 });
        }
        if (file.size > MAX_ATTACHMENT_SIZE) {
            return NextResponse.json({ error: ATTACHMENT_TOO_LARGE_ERROR }, { status: 413 });
        }

        const body = Buffer.from(await file.arrayBuffer());
        if (body.length > MAX_ATTACHMENT_SIZE) {
            return NextResponse.json({ error: ATTACHMENT_TOO_LARGE_ERROR }, { status: 413 });
        }
        const kind = detectAttachmentKind(body);
        if (!kind) return NextResponse.json({ error: ATTACHMENT_INVALID_ERROR }, { status: 400 });

        const attachmentId = crypto.randomUUID();
        const { ulSegmentOf } = await import('@/lib/media/server');
        const key = buildTaskAttachmentKey(await ulSegmentOf(access.ulId), id, attachmentId, kind.ext);
        const fileName = sanitizeAttachmentFileName(file.name, kind.ext);
        const createdAt = new Date().toISOString();

        const { putObject, deleteObject } = await import('@/lib/r2');
        await putObject(key, body, kind.contentType);
        try {
            await insertAttachment({
                id: attachmentId, ownerType: 'TASK', ownerId: id, ulId: access.ulId, r2Key: key,
                fileName, contentType: kind.contentType, size: body.length,
                uploadedBy: access.session.user.id ?? null, createdAt,
            });
        } catch (error: unknown) {
            // La base n'a pas enregistré : l'objet n'est référencé nulle part.
            await deleteObject(key).catch((e: unknown) =>
                console.error(`[fleet-tracking] nettoyage de ${key} impossible :`, getErrorMessage(e)));
            throw error;
        }

        return NextResponse.json({
            success: true,
            attachment: {
                id: attachmentId, fileName, contentType: kind.contentType, size: body.length,
                uploadedByName: access.session.user.name ?? access.session.user.email ?? null, createdAt,
            },
        }, { status: 201 });
    } catch (e: unknown) {
        console.error('POST /api/fleet-tracking/tasks/[id]/attachments error:', getErrorMessage(e));
        return NextResponse.json({ error: "Erreur lors de l'enregistrement de la pièce jointe." }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Ajout d'une pièce jointe à une tâche de suivi technique", entityType: 'fleetTask', idParam: 'id' });
