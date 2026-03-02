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
        console.error('Network error OneSignal push:', error);
        return false;
    }
}
