import crypto from 'crypto';
import { db } from '@/lib/db';

export async function sendPushNotification({
    tags,
    headings,
    contents,
    url
}: {
    tags: Array<{ field: string, key: string, relation: string, value: string }>;
    headings: { [key: string]: string };
    contents: { [key: string]: string };
    url?: string;
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
            .filter(t => t.field === 'tag' && t.key.startsWith('role_') && t.value === 'true')
            .map(t => t.key.replace('role_', ''));

        if (targetedRoleNames.length > 0) {
            // Build the SQL query to find users matching any of the roles
            const placeholders = targetedRoleNames.map(() => '?').join(',');
            const res = await db.execute({
                sql: `
                    SELECT DISTINCT u.id 
                    FROM "User" u
                    JOIN "UserRole" ur ON u.id = ur.userId
                    JOIN "Role" r ON ur.roleId = r.id
                    WHERE r.name IN (${placeholders})
                `,
                args: targetedRoleNames
            });

            // Insert a notification for each targeted user
            const title = headings.fr || headings.en || 'Nouvelle notification';
            const message = contents.fr || contents.en || '';

            // Insert them one by one or batched
            const insertPromises = res.rows.map(row => {
                const notifyId = crypto.randomUUID();
                // Append notifyId to the URL so that when the user clicks the push notification,
                // we can delete it from the DB.
                const updatedUrl = url ? (url.includes('?') ? `${url}&notifyId=${notifyId}` : `${url}?notifyId=${notifyId}`) : undefined;

                return db.execute({
                    sql: `INSERT INTO "Notification" (id, userId, title, message, url) VALUES (?, ?, ?, ?, ?)`,
                    args: [notifyId, row.id as string, title, message, updatedUrl || null]
                });
            });

            await Promise.all(insertPromises);
        }

        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${apiKey}`,
            },
            body: JSON.stringify({
                app_id: appId,
                filters: tags, // Targeting by tags like [{ field: "tag", key: "role_RESPO", relation: "=", value: "true" }]
                headings,
                contents,
                url
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
