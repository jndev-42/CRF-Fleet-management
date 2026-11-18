import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';
import { forbiddenResponse } from '@/lib/apiAuth';
import { ownsResource, requireFleetManager } from '@/lib/fleetTracking/access';
import { deleteAppointment, getAppointmentRow } from '@/lib/fleetTracking/controlsStore';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = () => NextResponse.json({ error: 'Rendez-vous introuvable' }, { status: 404 });

/**
 * DELETE /api/fleet-tracking/controls/appointments/[id]
 * Supprime un rendez-vous d'un véhicule actuellement dans l'UL (l'échéance redevient « À dater » ou
 * « Dépassée »). Autre UL → 403. Une tâche créée avec le rendez-vous est conservée.
 */
async function deleteHandler(_request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;

        const row = await getAppointmentRow(id);
        if (!row) return NOT_FOUND();
        if (!ownsResource(access, row.vehicleUlId)) return forbiddenResponse();

        if (!(await deleteAppointment(id, access.ulId))) return NOT_FOUND();
        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        console.error('DELETE /api/fleet-tracking/controls/appointments/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const DELETE = withAudit(deleteHandler, { action: "Suppression d'un rendez-vous de contrôle", entityType: 'fleetControlAppointment', idParam: 'id' });
