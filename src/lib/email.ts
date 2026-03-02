export async function sendEmailViaWebhook({
    to,
    subject,
    body
}: {
    to: string[];
    subject: string;
    body: string;
}) {
    const webhookUrl = process.env.GOOGLE_WEBHOOK_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (!webhookUrl || !webhookSecret) {
        console.warn('Webhook URL or Secret is not defined in environment variables. Email will not be sent.');
        return false;
    }

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                secret: webhookSecret,
                to,
                subject,
                body
            })
        });

        if (!res.ok) {
            console.error('Failed to send email via webhook:', await res.text());
            return false;
        }

        return true;
    } catch (error) {
        console.error('Network error sending email via webhook:', error);
        return false;
    }
}
