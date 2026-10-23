import crypto from 'crypto';
import webpush from 'web-push';
import { db } from '@/lib/db';
import { getErrorMessage } from '@/lib/utils/error';

/** Durée pendant laquelle le service push conserve un message pour un appareil hors ligne. */
const PUSH_TTL_SECONDS = 24 * 60 * 60;
/** Délai max d'une requête vers le service push : les appelants attendent l'envoi dans leur requête API. */
const PUSH_TIMEOUT_MS = 10_000;

export interface PushPayload {
    title: string;
    body: string;
    url?: string;
}

/**
 * Notifie les utilisateurs porteurs d'au moins un des `roles` (dans l'UL `ulId` si fournie) :
 * une notification in-app (table `Notification`) par utilisateur, puis un envoi Web Push
 * (W3C, VAPID) vers chacun de ses appareils abonnés.
 *
 * `ADMIN` couvre aussi SUPER_ADMIN. `RESPO` désigne le responsable d'activité (notes de frais) :
 * pour joindre présidents et cadres, les nommer explicitement. `RESP_VEHICULE` (responsable véhicule)
 * reçoit les notifications véhicule (incidents, problèmes au départ ou au retour, alertes flotte) ; CADRE
 * n'est plus visé que par les nouvelles demandes de réservation.
 * `userIds` ajoute des utilisateurs nommés aux destinataires ; `excludeUserId` écarte l'auteur de l'action.
 * Chaque utilisateur ne reçoit qu'une notification, même s'il cumule plusieurs rôles ciblés.
 * Ne lève jamais : un échec d'envoi push ne doit pas faire échouer la route appelante.
 */
export async function sendPushNotification({
    roles,
    headings,
    contents,
    url,
    ulId,
    userIds,
    excludeUserId
}: {
    roles: string[];
    headings: { [key: string]: string };
    contents: { [key: string]: string };
    url?: string;
    ulId?: string;
    userIds?: string[];
    excludeUserId?: string | string[];
}) {
    try {
        let expandedRoleNames: string[] = [];
        for (const roleName of roles) {
            if (roleName === 'ADMIN') {
                expandedRoleNames.push('ADMIN', 'SUPER_ADMIN');
            } else {
                expandedRoleNames.push(roleName);
            }
        }
        expandedRoleNames = Array.from(new Set(expandedRoleNames));

        const title = headings.fr || headings.en || 'Nouvelle notification';
        const message = contents.fr || contents.en || '';
        let targetedUserIds: string[] = [];

        if (expandedRoleNames.length > 0) {
            let res;
            if (ulId && ulId !== 'default') {
                const placeholders = expandedRoleNames.map(() => '?').join(',');
                const roleConditions = expandedRoleNames.map(() => `',' || uu.roles || ',' LIKE ?`).join(' OR ');
                const roleLikeArgs = expandedRoleNames.map(role => `%,${role},%`);

                res = await db.execute({
                    sql: `
                        SELECT DISTINCT u.id
                        FROM "User" u
                        JOIN "UserUL" uu ON u.id = uu.userId
                        WHERE uu.ulId = ?
                          AND (
                            (uu.roles IS NOT NULL AND uu.roles != '' AND (${roleConditions}))
                            OR
                            ((uu.roles IS NULL OR uu.roles = '') AND EXISTS (
                               SELECT 1 FROM "UserRole" ur
                               JOIN "Role" r ON ur.roleId = r.id
                               WHERE ur.userId = u.id AND r.name IN (${placeholders})
                            ))
                          )
                    `,
                    args: [ulId, ...roleLikeArgs, ...expandedRoleNames]
                });
            } else {
                const placeholders = expandedRoleNames.map(() => '?').join(',');
                res = await db.execute({
                    sql: `
                        SELECT DISTINCT u.id 
                        FROM "User" u
                        JOIN "UserRole" ur ON u.id = ur.userId
                        JOIN "Role" r ON ur.roleId = r.id
                        WHERE r.name IN (${placeholders})
                    `,
                    args: expandedRoleNames
                });
            }

            targetedUserIds = res.rows.map(row => row.id as string);
        }

        targetedUserIds = uniqueRecipients([...targetedUserIds, ...(userIds ?? [])], excludeUserId);
        await insertNotifications(targetedUserIds, { title, message, url, ulId });

        return await deliverWebPush(targetedUserIds, { title, body: message, url });
    } catch (error) {
        console.error('Error sending push or in-app notification:', error);
        return false;
    }
}

/**
 * Notifie des utilisateurs nommés (in-app + Web Push), au plus une fois chacun.
 * `excludeUserId` écarte l'auteur de l'action : on ne notifie jamais quelqu'un de sa propre action.
 * Ne lève jamais : un échec ne doit pas faire échouer la route appelante.
 */
export async function notifyUsers({
    userIds,
    title,
    message,
    url,
    ulId,
    excludeUserId
}: {
    userIds: string[];
    title: string;
    message: string;
    url?: string;
    ulId?: string;
    excludeUserId?: string | string[];
}) {
    try {
        const recipients = uniqueRecipients(userIds, excludeUserId);
        await insertNotifications(recipients, { title, message, url, ulId });
        return await deliverWebPush(recipients, { title, body: message, url });
    } catch (error) {
        console.error('Error sending push or in-app notification:', error);
        return false;
    }
}

/** Dédoublonne les destinataires et retire l'auteur de l'action. */
function uniqueRecipients(userIds: string[], excludeUserId?: string | string[]): string[] {
    const excluded = new Set([excludeUserId ?? []].flat());
    return Array.from(new Set(userIds)).filter(id => id && !excluded.has(id));
}

/** Crée une ligne `Notification` (in-app) par destinataire. */
async function insertNotifications(
    userIds: string[],
    { title, message, url, ulId }: { title: string; message: string; url?: string; ulId?: string },
): Promise<void> {
    await Promise.all(userIds.map(userId => db.execute({
        sql: `INSERT INTO "Notification" (id, userId, title, message, url, ulId) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), userId, title, message, url || null, ulId || 'default']
    })));
}

/** Taille max du corps d'un push : le service push plafonne la charge utile (~4 Ko). */
const PUSH_BODY_MAX_CHARS = 500;

/** Tronque le corps d'un push (la notification in-app, elle, garde le message entier). */
function truncateForPush(body: string): string {
    return body.length > PUSH_BODY_MAX_CHARS ? `${body.slice(0, PUSH_BODY_MAX_CHARS - 1)}…` : body;
}

/**
 * Envoie le payload à tous les appareils abonnés des utilisateurs ciblés.
 * Retourne `true` tant que la phase in-app a réussi : les erreurs d'envoi sont loggées,
 * seuls les abonnements expirés (404/410) sont purgés.
 */
async function deliverWebPush(userIds: string[], payload: PushPayload): Promise<boolean> {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (!publicKey || !privateKey || !subject) {
        console.warn('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT is not defined. Push Notification will not be sent.');
        return true;
    }
    if (userIds.length === 0) return true;

    try {
        const placeholders = userIds.map(() => '?').join(',');
        const subs = await db.execute({
            sql: `SELECT id, endpoint, p256dh, auth FROM "PushSubscription" WHERE userId IN (${placeholders})`,
            args: userIds,
        });
        if (subs.rows.length === 0) return true;

        webpush.setVapidDetails(subject, publicKey, privateKey);
        const body = JSON.stringify({ ...payload, body: truncateForPush(payload.body) });

        const results = await Promise.allSettled(subs.rows.map(row =>
            webpush.sendNotification(
                {
                    endpoint: row.endpoint as string,
                    keys: { p256dh: row.p256dh as string, auth: row.auth as string },
                },
                body,
                { TTL: PUSH_TTL_SECONDS, timeout: PUSH_TIMEOUT_MS },
            ),
        ));

        const expiredIds: string[] = [];
        results.forEach((result, idx) => {
            if (result.status === 'fulfilled') return;
            const statusCode = (result.reason as { statusCode?: number } | undefined)?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
                expiredIds.push(subs.rows[idx].id as string);
            } else {
                console.error('Failed to send web push:', getErrorMessage(result.reason));
            }
        });

        if (expiredIds.length > 0) {
            await db.execute({
                sql: `DELETE FROM "PushSubscription" WHERE id IN (${expiredIds.map(() => '?').join(',')})`,
                args: expiredIds,
            });
        }
    } catch (error) {
        console.error('Error sending web push:', getErrorMessage(error));
    }
    return true;
}
