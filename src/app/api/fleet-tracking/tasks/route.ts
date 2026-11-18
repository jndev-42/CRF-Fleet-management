import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';
import { parseBody, requireFleetManager } from '@/lib/fleetTracking/access';
import { createTaskSchema, searchParamsToObject, taskFiltersSchema } from '@/lib/fleetTracking/tasks';
import { checkTaskDossier, withDossierVehicleLink } from '@/lib/fleetTracking/dossierGuards';
import { checkTaskTargets, notifyNewAssignees } from '@/lib/fleetTracking/taskGuards';
import { createTask, getTaskDetail, listTasks } from '@/lib/fleetTracking/tasksStore';

/**
 * GET /api/fleet-tracking/tasks?vehicle=&assignee=me|<id>&pinned=1&priority=&status=A,B&q=&dossier=<id>|none
 * Tâches de l'UL de session, enrichies (assignés, rattachements, nombre de PJ).
 * `canManageVehicles`.
 *
 * POST /api/fleet-tracking/tasks
 * Crée une tâche dans l'UL de session ; les assignés (autres que l'auteur) sont notifiés.
 * `dossierId` : dossier de la même UL (400 sinon) ; la tâche hérite alors du
 * rattachement au véhicule du dossier.
 */
export async function GET(request: Request) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;

        const parsed = taskFiltersSchema.safeParse(searchParamsToObject(new URL(request.url).searchParams));
        if (!parsed.success) {
            return NextResponse.json({ error: `Filtre invalide : ${parsed.error.issues[0]?.message ?? ''}`.trim() }, { status: 400 });
        }
        const tasks = await listTasks(access.ulId, parsed.data, access.session.user.id ?? null);
        return NextResponse.json({ tasks });
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/tasks error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

async function postHandler(request: Request) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;

        const parsed = await parseBody(request, createTaskSchema);
        if ('response' in parsed) return parsed.response;

        const dossier = await checkTaskDossier(access.ulId, parsed.data.dossierId);
        if (!dossier.ok) return dossier.response;
        const refused = await checkTaskTargets(access.ulId, parsed.data);
        if (refused) return refused;

        // Créée dans un dossier : la tâche hérite du rattachement au véhicule du dossier
        // (s'il est toujours dans l'UL et si la liste n'est pas pleine).
        const inherited = dossier.dossier ? await withDossierVehicleLink(access.ulId, dossier.dossier, parsed.data.links) : null;
        const input = inherited ? { ...parsed.data, links: inherited } : parsed.data;

        const id = await createTask(access.ulId, input, access.userId);
        await notifyNewAssignees({
            taskId: id,
            title: parsed.data.title,
            ulId: access.ulId,
            userIds: [...new Set(parsed.data.assigneeIds)],
            authorId: access.session.user.id,
            authorName: access.session.user.name,
        });
        const task = await getTaskDetail(id, access.ulId);
        // Supprimée entre-temps : la création a bien eu lieu, sans détail à renvoyer.
        return NextResponse.json(task ? { success: true, id, task } : { success: true, id }, { status: 201 });
    } catch (e: unknown) {
        console.error('POST /api/fleet-tracking/tasks error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Création d'une tâche de suivi technique", entityType: 'fleetTask' });
