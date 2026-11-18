import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { ownsResource, parseBody, requireFleetManager, type FleetAccess } from '@/lib/fleetTracking/access';
import { updateTaskSchema } from '@/lib/fleetTracking/tasks';
import { checkTaskTargets, notifyNewAssignees } from '@/lib/fleetTracking/taskGuards';
import {
    deleteTask,
    getTaskAssigneeIds,
    getTaskDetail,
    getTaskLinkInputs,
    getTaskRow,
    updateTask,
} from '@/lib/fleetTracking/tasksStore';

// La suppression efface aussi les pièces jointes sur R2.
export const runtime = 'nodejs';
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = () => NextResponse.json({ error: 'Tâche introuvable' }, { status: 404 });
const OTHER_UL = () => forbiddenResponse('Cette tâche appartient à une autre unité locale');

/** Tâche de l'UL de session, ou la réponse 404/403 à renvoyer. */
async function loadOwnedTask(access: Extract<FleetAccess, { ok: true }>, id: string) {
    const row = await getTaskRow(id);
    if (!row) return { ok: false as const, response: NOT_FOUND() };
    if (!ownsResource(access, row.ulId)) return { ok: false as const, response: OTHER_UL() };
    return { ok: true as const, row };
}

/** GET /api/fleet-tracking/tasks/[id] — tâche enrichie avec ses pièces jointes. */
export async function GET(_request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;
        const owned = await loadOwnedTask(access, id);
        if (!owned.ok) return owned.response;

        const task = await getTaskDetail(id, access.ulId);
        if (!task) return NOT_FOUND();
        return NextResponse.json({ task });
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/tasks/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/**
 * PATCH /api/fleet-tracking/tasks/[id]
 * Modification partielle ; `assigneeIds` et `links` remplacent les listes. Toute
 * transition d'état est permise. Les assignés nouvellement ajoutés sont notifiés.
 */
async function patchHandler(request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;

        const parsed = await parseBody(request, updateTaskSchema);
        if ('response' in parsed) return parsed.response;

        const owned = await loadOwnedTask(access, id);
        if (!owned.ok) return owned.response;

        const [previousAssignees, previousLinks] = await Promise.all([getTaskAssigneeIds(id), getTaskLinkInputs(id)]);
        const refused = await checkTaskTargets(access.ulId, parsed.data, { assigneeIds: previousAssignees, links: previousLinks });
        if (refused) return refused;

        if (!(await updateTask(id, access.ulId, owned.row, parsed.data))) return NOT_FOUND();

        if (parsed.data.assigneeIds) {
            const added = [...new Set(parsed.data.assigneeIds)].filter(u => !previousAssignees.includes(u));
            await notifyNewAssignees({
                taskId: id,
                title: parsed.data.title ?? owned.row.title,
                ulId: access.ulId,
                userIds: added,
                authorId: access.session.user.id,
                authorName: access.session.user.name,
            });
        }
        const task = await getTaskDetail(id, access.ulId);
        if (!task) return NOT_FOUND();
        return NextResponse.json({ success: true, task });
    } catch (e: unknown) {
        console.error('PATCH /api/fleet-tracking/tasks/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/** DELETE /api/fleet-tracking/tasks/[id] — tâche, assignés, rattachements et pièces jointes (R2 puis base). */
async function deleteHandler(_request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;
        const owned = await loadOwnedTask(access, id);
        if (!owned.ok) return owned.response;

        if (!(await deleteTask(id, access.ulId))) return NOT_FOUND();
        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        console.error('DELETE /api/fleet-tracking/tasks/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const PATCH = withAudit(patchHandler, { action: "Modification d'une tâche de suivi technique", entityType: 'fleetTask', idParam: 'id' });
export const DELETE = withAudit(deleteHandler, { action: "Suppression d'une tâche de suivi technique", entityType: 'fleetTask', idParam: 'id' });
