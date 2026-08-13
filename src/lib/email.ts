import nodemailer from 'nodemailer';

// Instance mise en cache au niveau module — réutilisée entre les appels d'un
// même lambda "chaud", à l'image de src/lib/drive.ts::getDriveClient.
let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
    if (cachedTransporter) return cachedTransporter;

    cachedTransporter = nodemailer.createTransport({
        service: 'gmail', // par défaut pour une adresse gmail
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
    return cachedTransporter;
}

export async function sendEmailViaWebhook({
    to,
    subject,
    body
}: {
    to: string[];
    subject: string;
    body: string;
}) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('SMTP_USER or SMTP_PASS is not defined. Email will not be sent.');
        return false;
    }

    try {
        const transporter = getTransporter();

        const info = await transporter.sendMail({
            from: `"Martine" <${process.env.SMTP_USER}>`,
            to: to.join(', '),
            subject,
            html: body
        });

        console.log('Message sent: %s', info.messageId);
        return true;
    } catch (error) {
        console.error('Network error sending email via Nodemailer:', error);
        return false;
    }
}
