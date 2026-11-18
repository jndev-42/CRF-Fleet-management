import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import type { FleetAccess } from './access';
import {
    ATTACHMENT_INVALID_ERROR,
    attachmentContentDisposition,
    ATTACHMENT_TOO_LARGE_ERROR,
    buildAttachmentKey,
    detectAttachmentKind,
    MAX_ATTACHMENT_SIZE,
    MAX_ATTACHMENTS_PER_OWNER,
    TOO_MANY_ATTACHMENTS_ERROR,
    TOO_MANY_DOSSIER_ATTACHMENTS_ERROR,
    sanitizeAttachmentFileName,
    type AttachmentOwnerType,
} from './attachments';
import { countAttachments, insertAttachment, type AttachmentRow } from './tasksStore';

/**
 * Corps des routes de pièces jointes, communs aux tâches et aux dossiers — serveur
 * uniquement. L'appelant a déjà vérifié la session et l'appartenance du propriétaire
 * (tâche ou dossier) à l'UL de session.
 */

/**
 * Dépôt d'UN fichier (multipart, champ `file`) : plafond par propriétaire (400),
 * taille contrôlée avant puis après lecture (413), type par signature binaire (400),
 * R2 puis base — l'objet est nettoyé si l'insertion échoue. Rien n'est écrit sur R2
 * pour un fichier refusé. Réponse 201 `{ success, attachment }`.
 */
export async function handleAttachmentUpload(
    request: Request,
    access: Extract<FleetAccess, { ok: true }>,
    owner: { type: AttachmentOwnerType; id: string },
): Promise<NextResponse> {
    if (await countAttachments(owner.type, owner.id) >= MAX_ATTACHMENTS_PER_OWNER) {
        const error = owner.type === 'TASK' ? TOO_MANY_ATTACHMENTS_ERROR : TOO_MANY_DOSSIER_ATTACHMENTS_ERROR;
        return NextResponse.json({ error }, { status: 400 });
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
    const key = buildAttachmentKey(owner.type, await ulSegmentOf(access.ulId), owner.id, attachmentId, kind.ext);
    const fileName = sanitizeAttachmentFileName(file.name, kind.ext);
    const createdAt = new Date().toISOString();

    const { putObject, deleteObject } = await import('@/lib/r2');
    await putObject(key, body, kind.contentType);
    try {
        await insertAttachment({
            id: attachmentId, ownerType: owner.type, ownerId: owner.id, ulId: access.ulId, r2Key: key,
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
}

/**
 * Contenu d'une pièce jointe : `inline` (PDF, images) ou téléchargement avec
 * `?download=1`, servi avec une CSP `sandbox` (fichier déposé par un utilisateur sur
 * l'origine de l'appli). 409 si l'objet R2 manque.
 */
export async function serveAttachment(request: Request, row: AttachmentRow): Promise<NextResponse> {
    const { getObject } = await import('@/lib/r2');
    const buffer = await getObject(row.r2Key);
    if (!buffer) {
        console.error(`[fleet-tracking] objet R2 introuvable pour la pièce jointe ${row.id} : ${row.r2Key}`);
        return NextResponse.json({ error: 'Le fichier est introuvable. Contactez un administrateur.' }, { status: 409 });
    }
    const download = new URL(request.url).searchParams.get('download') === '1';
    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            'Content-Type': row.contentType,
            'Content-Disposition': attachmentContentDisposition(row.fileName, download),
            'Content-Length': String(buffer.length),
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            // Aucun script, aucune requête : la visionneuse PDF et les images restent lisibles.
            'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
        },
    });
}
