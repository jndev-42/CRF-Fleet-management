import nodemailer from 'nodemailer';

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
        const transporter = nodemailer.createTransport({
            service: 'gmail', // par défaut pour une adresse gmail
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        const info = await transporter.sendMail({
            from: `"Gestion de Flotte" <${process.env.SMTP_USER}>`,
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
