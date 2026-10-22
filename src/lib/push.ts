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
 * `ADMIN` couvre aussi SUPER_ADMIN ; `RESPO` couvre PRESIDENT et CADRE.
 * Ne lève jamais : un échec d'envoi push ne doit pas faire échouer la route appelante.
 */
export async function sendPushNotification({
    roles,
    headings,
    contents,
    url,
    ulId
}: {
    roles: string[];
    headings: { [key: string]: string };
    contents: { [key: string]: string };
    url?: string;
    ulId?: string;
}) {
    try {
        let expandedRoleNames: string[] = [];
        for (const roleName of roles) {
            if (roleName === 'ADMIN') {
                expandedRoleNames.push('ADMIN', 'SUPER_ADMIN');
            } else if (roleName === 'RESPO') {
                expandedRoleNames.push('PRESIDENT', 'CADRE');
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

            // Insert a notification record for each targeted user
            const insertPromises = targetedUserIds.map(userId => {
                const notifyId = crypto.randomUUID();
                return db.execute({
                    sql: `INSERT INTO "Notification" (id, userId, title, message, url, ulId) VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [notifyId, userId, title, message, url || null, ulId || 'default']
                });
            });

            await Promise.all(insertPromises);
        }

        return await deliverWebPush(targetedUserIds, { title, body: message, url });
    } catch (error) {
        console.error('Error sending push or in-app notification:', error);
        return false;
    }
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
        const body = JSON.stringify(payload);

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
