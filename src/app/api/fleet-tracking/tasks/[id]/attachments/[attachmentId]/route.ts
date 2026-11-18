/**
 * Une pièce jointe de tâche.
 *
 *   GET    — contenu `inline` (PDF, images), ou téléchargement avec `?download=1`
 *   DELETE — retrait (base puis R2 ; un échec R2 est journalisé, la base reste cohérente)
 *
 * Réservé aux responsables de l'UL de la tâche (`canManageVehicles`) : une pièce
 * jointe d'une autre UL répond 403.
 */
import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { ownsResource, requireFleetManager, type FleetAccess } from '@/lib/fleetTracking/access';
import { serveAttachment } from '@/lib/fleetTracking/attachmentRoutes';
import { deleteAttachment, getAttachmentRow } from '@/lib/fleetTracking/tasksStore';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Context = { params: Promise<{ id: string; attachmentId: string }> };

const NOT_FOUND = () => NextResponse.json({ error: 'Pièce jointe introuvable' }, { status: 404 });

async function loadOwnedAttachment(access: Extract<FleetAccess, { ok: true }>, taskId: string, attachmentId: string) {
    const row = await getAttachmentRow(attachmentId);
    if (!row || row.ownerType !== 'TASK' || row.ownerId !== taskId) return { ok: false as const, response: NOT_FOUND() };
    if (!ownsResource(access, row.ulId)) return { ok: false as const, response: forbiddenResponse('Cette pièce jointe appartient à une autre unité locale') };
    return { ok: true as const, row };
}

export async function GET(request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id, attachmentId } = await params;
        const owned = await loadOwnedAttachment(access, id, attachmentId);
        if (!owned.ok) return owned.response;

        return await serveAttachment(request, owned.row);
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/tasks/[id]/attachments/[attachmentId] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la lecture de la pièce jointe.' }, { status: 500 });
    }
}

async function deleteHandler(_request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id, attachmentId } = await params;
        const owned = await loadOwnedAttachment(access, id, attachmentId);
        if (!owned.ok) return owned.response;

        if (!(await deleteAttachment(attachmentId, access.ulId))) return NOT_FOUND();
        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        console.error('DELETE /api/fleet-tracking/tasks/[id]/attachments/[attachmentId] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const DELETE = withAudit(deleteHandler, { action: "Suppression d'une pièce jointe de tâche de suivi technique", entityType: 'fleetAttachment', idParam: 'attachmentId' });
