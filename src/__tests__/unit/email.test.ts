import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));

vi.mock('nodemailer', () => ({
    default: { createTransport: () => mockCreateTransport() },
}));

import { sendEmailViaWebhook } from '@/lib/email';

describe('sendEmailViaWebhook', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        mockSendMail.mockReset();
        mockCreateTransport.mockClear();
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('retourne false sans envoyer si SMTP_USER/SMTP_PASS sont absents', async () => {
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;

        const result = await sendEmailViaWebhook({ to: ['dest@test.com'], subject: 'Test', body: '<p>Hello</p>' });
        expect(result).toBe(false);
        expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('envoie l\'email et retourne true (happy path)', async () => {
        process.env.SMTP_USER = 'sender@gmail.com';
        process.env.SMTP_PASS = 'secret';
        mockSendMail.mockResolvedValue({ messageId: 'msg-1' });

        const result = await sendEmailViaWebhook({ to: ['dest@test.com'], subject: 'Test', body: '<p>Hello</p>' });
        expect(result).toBe(true);
        expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
            from: '"Martine" <sender@gmail.com>',
            to: 'dest@test.com',
            subject: 'Test',
            html: '<p>Hello</p>',
        }));
    });

    it('joint plusieurs destinataires avec une virgule', async () => {
        process.env.SMTP_USER = 'sender@gmail.com';
        process.env.SMTP_PASS = 'secret';
        mockSendMail.mockResolvedValue({ messageId: 'msg-2' });

        await sendEmailViaWebhook({ to: ['a@test.com', 'b@test.com'], subject: 'Test', body: 'body' });
        expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@test.com, b@test.com' }));
    });

    it('retourne false si l\'envoi échoue', async () => {
        process.env.SMTP_USER = 'sender@gmail.com';
        process.env.SMTP_PASS = 'secret';
        mockSendMail.mockRejectedValue(new Error('SMTP down'));

        const result = await sendEmailViaWebhook({ to: ['dest@test.com'], subject: 'Test', body: 'body' });
        expect(result).toBe(false);
    });
});
