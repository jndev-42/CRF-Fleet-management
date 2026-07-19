import crypto from 'crypto';
import { db } from '@/lib/db';

type OneSignalTag = { field: string; key: string; relation: string; value: string } | { operator: string };

export async function sendPushNotification({
    tags,
    headings,
    contents,
    url,
    ulId
}: {
    tags: OneSignalTag[];
    headings: { [key: string]: string };
    contents: { [key: string]: string };
    url?: string;
    ulId?: string;
}) {
    const appId = process.env.ONESIGNAL_ID;
    const apiKey = process.env.ONESIGNAL_API_KEY;

    if (!appId || !apiKey) {
        console.warn('ONESIGNAL_ID or ONESIGNAL_API_KEY is not defined. Push Notification will not be sent.');
        return false;
    }

    try {
        // Find targeted users based on the OneSignal tags
        const targetedRoleNames = tags
            .filter((t): t is { field: string; key: string; relation: string; value: string } =>
                'field' in t && t.field === 'tag' && t.key.startsWith('role_') && t.value === 'true')
            .map(t => t.key.replace('role_', ''));

        let expandedRoleNames: string[] = [];
        for (const roleName of targetedRoleNames) {
            if (roleName === 'ADMIN') {
                expandedRoleNames.push('ADMIN', 'SUPER_ADMIN');
            } else if (roleName === 'RESPO') {
                expandedRoleNames.push('PRESIDENT', 'CADRE');
            } else {
                expandedRoleNames.push(roleName);
            }
        }
        expandedRoleNames = Array.from(new Set(expandedRoleNames));

        if (expandedRoleNames.length > 0) {
            let res;
            if (ulId && ulId !== 'default') {
                const placeholders = expandedRoleNames.map(() => '?').join(',');
                const roleConditions = expandedRoleNames.map(role => `',' || uu.roles || ',' LIKE '%,${role},%'`).join(' OR ');

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
                    args: [ulId, ...expandedRoleNames]
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

            // Insert a notification for each targeted user
            const title = headings.fr || headings.en || 'Nouvelle notification';
            const message = contents.fr || contents.en || '';

            // Insert a notification record for each targeted user
            const insertPromises = res.rows.map(row => {
                const notifyId = crypto.randomUUID();
                return db.execute({
                    sql: `INSERT INTO "Notification" (id, userId, title, message, url, ulId) VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [notifyId, row.id as string, title, message, url || null, ulId || 'default']
                });
            });

            await Promise.all(insertPromises);
        }

        // Map tag keys for OneSignal using the same expansion logic
        const updatedTags: OneSignalTag[] = [];
        expandedRoleNames.forEach((role, idx) => {
            if (idx > 0) {
                updatedTags.push({ operator: 'OR' });
            }
            const finalKey = ulId && ulId !== 'default' ? `role_${ulId}_${role}` : `role_${role}`;
            updatedTags.push({
                field: 'tag',
                key: finalKey,
                relation: '=',
                value: 'true'
            });
        });

        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${apiKey}`,
            },
            body: JSON.stringify({
                app_id: appId,
                filters: updatedTags,
                headings,
                contents,
                url: url ? (url.includes('?') ? `${url}&fromPush=true` : `${url}?fromPush=true`) : undefined
            })
        });

        if (!response.ok) {
            console.error('Failed to send OneSignal push:', await response.text());
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error sending push or in-app notification:', error);
        return false;
    }
}
