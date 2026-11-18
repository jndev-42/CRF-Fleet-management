import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';
import { parseBody, requireFleetManager } from '@/lib/fleetTracking/access';
import {
    APPOINTMENT_TASK_ERROR,
    CONTROL_TYPE_LABELS,
    appointmentDateError,
    appointmentSchema,
    appointmentTaskTitle,
    parisDay,
    type AppointmentInput,
} from '@/lib/fleetTracking/controls';
import {
    getAppointment,
    getAppointmentFor,
    loadUlControls,
    setAppointmentTask,
    syncTaskDueDate,
    upsertAppointment,
} from '@/lib/fleetTracking/controlsStore';
import { getUlVehicle } from '@/lib/fleetTracking/dossiersStore';
import { createTask, firstInvalidLink, invalidAssignees } from '@/lib/fleetTracking/tasksStore';
import type { TaskLinkInput } from '@/lib/fleetTracking/tasks';
import type { FleetAccess } from '@/lib/fleetTracking/access';

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Crée la tâche liée au rendez-vous et la rattache ; renvoie son identifiant. Assignée à
 * l'auteur seulement s'il est assignable dans l'UL (sinon sans assigné), sans notification.
 */
async function createLinkedTask(
    access: Extract<FleetAccess, { ok: true }>,
    appointmentId: string,
    input: AppointmentInput,
    vehicle: { id: string; name: string },
): Promise<string> {
    const links: TaskLinkInput[] = [{ type: 'VEHICLE', id: vehicle.id }];
    if (input.contactId) links.push({ type: 'CONTACT', id: input.contactId });
    const authorId = access.session.user.id;
    const assignable = !!authorId && (await invalidAssignees(access.ulId, [authorId])).length === 0;
    const taskId = await createTask(access.ulId, {
        title: appointmentTaskTitle(input.controlType, vehicle.name),
        description: input.notes ?? null,
        status: 'TODO',
        priority: 'NORMAL',
        dueDate: input.appointmentDate,
        pinned: false,
        assigneeIds: assignable && authorId ? [authorId] : [],
        links,
    }, access.userId);
    await setAppointmentTask(appointmentId, taskId);
    return taskId;
}

/**
 * PUT /api/fleet-tracking/controls/appointments
 * Crée ou remplace le rendez-vous d'un véhicule de l'UL pour un type de contrôle
 * (un seul par véhicule et par type), daté d'aujourd'hui à aujourd'hui + 5 ans (jours
 * Europe/Paris). Garage facultatif : contact de l'UL ou partagé — le garage déjà
 * enregistré est accepté sans revalidation (il a pu être retiré du partage).
 * `createTask: true` crée la tâche « Rendez-vous <contrôle> — <véhicule> » (échéance =
 * date du rendez-vous, rattachée au véhicule et au garage) une seule fois : tant que la
 * tâche liée existe, l'option est ignorée et l'échéance de la tâche suit la date du
 * rendez-vous. Échec de la tâche : 200 avec `taskError` (le rendez-vous est enregistré).
 * 400 : type inconnu ou sans échéance pour ce véhicule, date mal formée ou hors plage,
 * véhicule ou contact hors de l'UL.
 */
async function putHandler(request: Request) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;

        const parsed = await parseBody(request, appointmentSchema);
        if ('response' in parsed) return parsed.response;
        const input = parsed.data;

        const today = parisDay();
        const dateError = appointmentDateError(input.appointmentDate, today);
        if (dateError) return badRequest(dateError);

        const vehicle = await getUlVehicle(access.ulId, input.vehicleId);
        if (!vehicle) return badRequest('Véhicule invalide : introuvable ou hors de votre UL.');

        const rows = await loadUlControls(access.ulId, today, vehicle.id);
        if (!rows.some(r => r.controlType === input.controlType)) {
            return badRequest(`Aucune échéance de ${CONTROL_TYPE_LABELS[input.controlType].toLowerCase()} pour ce véhicule.`);
        }

        const existing = await getAppointmentFor(access.ulId, vehicle.id, input.controlType);
        const contactChanged = !!input.contactId && input.contactId !== existing?.contactId;
        if (contactChanged && await firstInvalidLink(access.ulId, [{ type: 'CONTACT', id: input.contactId! }])) {
            return badRequest('Garage invalide : contact introuvable ou hors de votre UL.');
        }

        const linkedTaskId = existing?.taskId ?? null;
        const id = await upsertAppointment(access.ulId, input, access.userId, linkedTaskId);

        let taskId = linkedTaskId;
        let taskCreated = false;
        let taskError: string | null = null;
        if (linkedTaskId) {
            if (existing?.appointmentDate !== input.appointmentDate) {
                await syncTaskDueDate(linkedTaskId, access.ulId, input.appointmentDate);
            }
        } else if (input.createTask) {
            try {
                taskId = await createLinkedTask(access, id, input, vehicle);
                taskCreated = true;
            } catch (e: unknown) {
                console.error('PUT /api/fleet-tracking/controls/appointments : tâche non créée :', getErrorMessage(e));
                taskError = APPOINTMENT_TASK_ERROR;
            }
        }

        const appointment = await getAppointment(id, access.ulId);
        return NextResponse.json({ success: true, id, appointment, taskId, taskCreated, taskError });
    } catch (e: unknown) {
        console.error('PUT /api/fleet-tracking/controls/appointments error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const PUT = withAudit(putHandler, { action: "Saisie d'un rendez-vous de contrôle", entityType: 'fleetControlAppointment' });
