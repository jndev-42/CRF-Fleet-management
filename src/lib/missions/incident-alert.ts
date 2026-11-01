import { sendPushNotification } from '@/lib/push';
import { getErrorMessage } from '@/lib/utils/error';
import { resolveAuthorHomeUlId } from './access';

/**
 * Alertes d'incident des comptes rendus de mission.
 *
 * Cible : les responsables mission (RESP_MISSION) de l'UL du rapport ; un
 * rapport rattaché à une DT n'a pas d'UL, l'alerte part alors vers l'UL de
 * rattachement (UL « home ») de son auteur. Envoyée à la création si une des
 * cases est cochée, et à la modification UNIQUEMENT pour une case qui passe de
 * faux à vrai (`newlyRaisedFlags`). Un échec d'envoi ne fait jamais échouer
 * l'enregistrement du rapport.
 */

/** Ordre d'affichage des cases dans la notification. */
export const INCIDENT_FLAGS = [
    'volunteer_accident',
    'had_acr',
    'had_hemorrhage',
    'had_complex_care',
    'needs_followup',
] as const;

export type IncidentFlag = (typeof INCIDENT_FLAGS)[number];

export const INCIDENT_FLAG_LABELS: Record<IncidentFlag, string> = {
    volunteer_accident: 'Accident bénévole',
    had_acr: 'Arrêt cardio-respiratoire (ACR)',
    had_hemorrhage: 'Hémorragie grave',
    had_complex_care: 'Prise en charge complexe',
    needs_followup: 'Suivi nécessaire',
};

export type IncidentFlagValues = Partial<Record<IncidentFlag, boolean | null | undefined>>;

/** Cases d'incident cochées dans un rapport, dans l'ordre d'affichage. */
export function incidentFlags(report: IncidentFlagValues): IncidentFlag[] {
    return INCIDENT_FLAGS.filter(flag => Boolean(report[flag]));
}

/** Cases qui passent de faux à vrai entre deux états d'un rapport. */
export function newlyRaisedFlags(before: IncidentFlagValues, after: IncidentFlagValues): IncidentFlag[] {
    return INCIDENT_FLAGS.filter(flag => Boolean(after[flag]) && !before[flag]);
}

export interface IncidentAlertReport {
    id: string;
    missionName: string;
    ulId: string | null;
    dtCode: string | null;
    /** `User.id` de l'auteur — sert à résoudre l'UL d'un rapport rattaché à une DT. */
    submittedBy: string | null;
}

/**
 * UL dont les responsables mission sont alertés : celle du rapport, sinon (rapport
 * DT) l'UL de rattachement de l'auteur (`UserUL.is_home`, à défaut sa première UL).
 */
export async function resolveAlertUlId(report: Pick<IncidentAlertReport, 'ulId' | 'submittedBy'>): Promise<string | null> {
    if (report.ulId && report.ulId !== 'default') return report.ulId;
    return resolveAuthorHomeUlId(report.submittedBy);
}

/**
 * Notifie (push + in-app) les responsables mission de l'UL ciblée des cases levées.
 * Ne lève jamais. Sans case levée, ou sans UL résoluble, n'envoie rien : une alerte
 * sans UL viserait TOUS les responsables mission de toutes les UL.
 *
 * @param actorUserId  auteur de l'action (création ou modification) : il n'est pas
 *                     notifié de sa propre déclaration.
 */
export async function notifyMissionIncident(
    report: IncidentAlertReport,
    flags: IncidentFlag[],
    actorUserId?: string | null,
): Promise<void> {
    if (flags.length === 0) return;
    try {
        const ulId = await resolveAlertUlId(report);
        if (!ulId) return;
        const labels = flags.map(flag => INCIDENT_FLAG_LABELS[flag]);
        await sendPushNotification({
            roles: ['RESP_MISSION'],
            headings: { fr: `Incident déclaré — ${report.missionName}` },
            contents: { fr: `${labels.join(', ')}.` },
            url: `/missions/${report.id}`,
            ulId,
            ...(actorUserId ? { excludeUserId: actorUserId } : {}),
        });
    } catch (e: unknown) {
        console.error('[missions] alerte d\'incident non envoyée :', getErrorMessage(e));
    }
}
