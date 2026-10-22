import { db } from '@/lib/db';

const INCIDENT_LABELS: Record<string, string> = {
    ACCIDENT: 'Accident',
    FLASH: 'Amende flash',
};

/**
 * Prévient les Responsables (PRESIDENT + CADRE) de l'UL du véhicule qu'un incident vient d'être soumis.
 * Le message ne mentionne volontairement pas l'auteur : les déclarations sont anonymes.
 * Ni le déclarant (`authorId`) ni l'auteur de l'action (`actorId`, p. ex. un admin qui soumet le brouillon d'autrui)
 * ne sont notifiés de leur propre action.
 * Rien n'est envoyé si le véhicule n'a pas d'UL (on ne notifie pas une autre UL par défaut).
 * Ne lève jamais : un échec de notification ne doit pas faire échouer la route appelante.
 */
export async function notifyIncidentSubmitted({
    vehicleId,
    type,
    authorId,
    actorId,
}: {
    vehicleId: string;
    type: string | null | undefined;
    authorId: string;
    actorId?: string;
}): Promise<void> {
    try {
        const vehicleResult = await db.execute({
            sql: `SELECT name, ulId FROM "Vehicle" WHERE id = ?`,
            args: [vehicleId],
        });
        if (vehicleResult.rows.length === 0) return;

        const vehicleName = vehicleResult.rows[0].name as string;
        const ulId = vehicleResult.rows[0].ulId as string | null;
        if (!ulId) {
            console.warn('Incident notification skipped: vehicle has no ulId', vehicleId);
            return;
        }
        const label = (type && INCIDENT_LABELS[type]) || 'Incident';

        const { sendPushNotification } = await import('@/lib/push');
        await sendPushNotification({
            roles: ['PRESIDENT', 'CADRE'],
            headings: { fr: `🚨 ${label} déclaré`, en: `🚨 Incident reported` },
            contents: {
                fr: `${label} déclaré sur ${vehicleName}.`,
                en: `Incident reported on ${vehicleName}.`,
            },
            url: `/vehicles/${encodeURIComponent(vehicleName)}`,
            ulId,
            excludeUserId: actorId ? [authorId, actorId] : authorId,
        });
    } catch (notifErr) {
        console.error('Failed to send incident notification:', notifErr);
    }
}
