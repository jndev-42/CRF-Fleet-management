import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils/error';
import { requireFleetManager } from '@/lib/fleetTracking/access';
import { buildContactsVCard, contactsVCardFileName } from '@/lib/fleetTracking/contacts';
import { getUlName, listVisibleContacts } from '@/lib/fleetTracking/contactsStore';

/**
 * GET /api/fleet-tracking/contacts/vcard
 * Export `.vcf` (vCard 3.0) des contacts de l'UL de session puis des contacts
 * partagés par les autres UL (suffixés « (UL <nom>) »). `canManageVehicles`.
 */
export async function GET() {
    try {
        const access = await requireFleetManager();
        if (!access.ok) return access.response;

        const [{ own, shared }, ulName] = await Promise.all([
            listVisibleContacts(access.ulId),
            getUlName(access.ulId),
        ]);

        return new Response(buildContactsVCard(own, shared), {
            status: 200,
            headers: {
                'Content-Type': 'text/vcard; charset=utf-8',
                'Content-Disposition': `attachment; filename="${contactsVCardFileName(ulName)}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (e: unknown) {
        console.error('GET /api/fleet-tracking/contacts/vcard error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
