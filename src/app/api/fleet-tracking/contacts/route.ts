import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';
import { parseBody, requireFleetManager } from '@/lib/fleetTracking/access';
import { createContactSchema } from '@/lib/fleetTracking/contacts';
import { createContact, listVisibleContacts } from '@/lib/fleetTracking/contactsStore';

/**
 * GET /api/fleet-tracking/contacts
 * `{ own, shared }` : contacts de l'UL de session, puis contacts partagés par les
 * autres UL (avec `ulName`, lecture seule). `canManageVehicles`.
 *
 * POST /api/fleet-tracking/contacts
 * Crée un contact dans l'UL de session (jamais une UL fournie par le client).
 */
export async function GET() {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;
        return NextResponse.json(await listVisibleContacts(access.ulId));
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/contacts error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

async function postHandler(request: Request) {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;

        const parsed = await parseBody(request, createContactSchema);
        if ('response' in parsed) return parsed.response;

        const contact = await createContact(access.ulId, parsed.data, access.userId);
        return NextResponse.json({ success: true, id: contact.id, contact }, { status: 201 });
    } catch (e: unknown) {
        console.error('POST /api/fleet-tracking/contacts error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Création d'un contact prestataire", entityType: 'fleetContact' });
