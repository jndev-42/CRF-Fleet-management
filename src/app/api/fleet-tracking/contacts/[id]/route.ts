import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { ownsResource, parseBody, requireFleetManager } from '@/lib/fleetTracking/access';
import { updateContactSchema } from '@/lib/fleetTracking/contacts';
import { deleteContact, getContact, updateContact } from '@/lib/fleetTracking/contactsStore';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = () => NextResponse.json({ error: 'Contact introuvable' }, { status: 404 });
const NOT_OWNER = () => forbiddenResponse('Seule l\'UL propriétaire peut modifier ce contact');

/**
 * PATCH /api/fleet-tracking/contacts/[id]
 * Modification partielle (y compris `shared`). Réservée à l'UL propriétaire : un
 * contact partagé par une autre UL reste en lecture seule (403).
 */
async function patchHandler(request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;

        const parsed = await parseBody(request, updateContactSchema);
        if ('response' in parsed) return parsed.response;

        const existing = await getContact(id);
        if (!existing) return NOT_FOUND();
        if (!ownsResource(access, existing.ulId)) return NOT_OWNER();

        const contact = await updateContact(id, access.ulId, parsed.data);
        if (!contact) return NOT_FOUND();
        return NextResponse.json({ success: true, contact });
    } catch (e: unknown) {
        console.error('PATCH /api/fleet-tracking/contacts/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/** DELETE /api/fleet-tracking/contacts/[id] — réservé à l'UL propriétaire. */
async function deleteHandler(_request: Request, { params }: Context) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        const { id } = await params;

        const existing = await getContact(id);
        if (!existing) return NOT_FOUND();
        if (!ownsResource(access, existing.ulId)) return NOT_OWNER();

        if (!(await deleteContact(id, access.ulId))) return NOT_FOUND();
        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        console.error('DELETE /api/fleet-tracking/contacts/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const PATCH = withAudit(patchHandler, { action: "Modification d'un contact prestataire", entityType: 'fleetContact', idParam: 'id' });
export const DELETE = withAudit(deleteHandler, { action: "Suppression d'un contact prestataire", entityType: 'fleetContact', idParam: 'id' });
