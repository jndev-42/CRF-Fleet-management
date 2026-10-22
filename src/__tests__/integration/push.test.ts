/**
 * Tests d'intégration — src/lib/push.ts (sendPushNotification).
 * DB réelle (notifications in-app + abonnements), `web-push` mocké (services push des navigateurs).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('web-push', () => ({
    default: {
        setVapidDetails: vi.fn(),
        sendNotification: vi.fn(),
    },
}));

import webpush from 'web-push';
import { sendPushNotification } from '@/lib/push';
import { db, seedRoles, seedUniteLocale, seedUser, seedUserRole, seedUserUL } from './setup';

const mockedSend = vi.mocked(webpush.sendNotification);
const mockedVapid = vi.mocked(webpush.setVapidDetails);

async function seedSubscription(id: string, userId: string, endpoint: string) {
    await db.execute({
        sql: `INSERT INTO "PushSubscription" (id, userId, endpoint, p256dh, auth) VALUES (?, ?, ?, 'p256dh-key', 'auth-key')`,
        args: [id, userId, endpoint],
    });
}

const baseArgs = {
    headings: { fr: 'Titre' },
    contents: { fr: 'Message' },
};

describe('sendPushNotification', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        mockedSend.mockReset();
        mockedSend.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
        mockedVapid.mockReset();
        process.env.VAPID_PUBLIC_KEY = 'public-key';
        process.env.VAPID_PRIVATE_KEY = 'private-key';
        process.env.VAPID_SUBJECT = 'mailto:test@croix-rouge.fr';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        vi.restoreAllMocks();
    });

    it('crée une notification in-app par utilisateur ciblé par rôle', async () => {
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'admin@test.com' });
        await seedUserRole('admin-1', 'ADMIN');
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedUserRole('user-1', 'CHVL');

        const result = await sendPushNotification({ ...baseArgs, roles: ['ADMIN'] });

        expect(result).toBe(true);
        const notifs = await db.execute(`SELECT userId FROM "Notification"`);
        expect(notifs.rows.map(r => r.userId)).toEqual(['admin-1']);
    });

    it('étend ADMIN vers SUPER_ADMIN et RESPO vers PRESIDENT et CADRE', async () => {
        await seedRoles();
        for (const [id, role] of [['super-1', 'SUPER_ADMIN'], ['pres-1', 'PRESIDENT'], ['cadre-1', 'CADRE'], ['chvl-1', 'CHVL']]) {
            await seedUser({ id, email: `${id}@test.com` });
            await seedUserRole(id, role);
        }

        await sendPushNotification({ ...baseArgs, roles: ['ADMIN', 'RESPO'] });

        const notifs = await db.execute(`SELECT userId FROM "Notification" ORDER BY userId`);
        expect(notifs.rows.map(r => r.userId)).toEqual(['cadre-1', 'pres-1', 'super-1']);
    });

    it('filtre par UL quand ulId est fourni', async () => {
        await seedRoles();
        await seedUniteLocale({ id: 'ul-a', name: 'A', slug: 'a' });
        await seedUniteLocale({ id: 'ul-b', name: 'B', slug: 'b' });
        await seedUser({ id: 'admin-a', email: 'a@test.com' });
        await seedUser({ id: 'admin-b', email: 'b@test.com' });
        await seedUserUL({ userId: 'admin-a', ulId: 'ul-a', roles: ['ADMIN'] });
        await seedUserUL({ userId: 'admin-b', ulId: 'ul-b', roles: ['ADMIN'] });

        await sendPushNotification({ ...baseArgs, roles: ['ADMIN'], ulId: 'ul-a' });

        const notifs = await db.execute(`SELECT userId FROM "Notification"`);
        expect(notifs.rows.map(r => r.userId)).toEqual(['admin-a']);
    });

    it('envoie un Web Push à chaque appareil abonné (2 admins, 3 appareils)', async () => {
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'a1@test.com' });
        await seedUserRole('admin-1', 'ADMIN');
        await seedUser({ id: 'admin-2', email: 'a2@test.com' });
        await seedUserRole('admin-2', 'ADMIN');
        await seedSubscription('s1', 'admin-1', 'https://push.example/1');
        await seedSubscription('s2', 'admin-1', 'https://push.example/2');
        await seedSubscription('s3', 'admin-2', 'https://push.example/3');

        const result = await sendPushNotification({ ...baseArgs, roles: ['ADMIN'], url: '/vehicles/VL186' });

        expect(result).toBe(true);
        const notifs = await db.execute(`SELECT id FROM "Notification"`);
        expect(notifs.rows).toHaveLength(2);
        expect(mockedSend).toHaveBeenCalledTimes(3);
        expect(mockedVapid).toHaveBeenCalledWith('mailto:test@croix-rouge.fr', 'public-key', 'private-key');
        const [subscription, body, options] = mockedSend.mock.calls[0];
        expect(subscription).toMatchObject({ keys: { p256dh: 'p256dh-key', auth: 'auth-key' } });
        expect(JSON.parse(body as string)).toEqual({ title: 'Titre', body: 'Message', url: '/vehicles/VL186' });
        expect(options).toMatchObject({ TTL: 86400, timeout: 10000 });
    });

    it('ne notifie pas les appareils des utilisateurs non ciblés', async () => {
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'a1@test.com' });
        await seedUserRole('admin-1', 'ADMIN');
        await seedUser({ id: 'user-1', email: 'u1@test.com' });
        await seedUserRole('user-1', 'CHVL');
        await seedSubscription('s1', 'user-1', 'https://push.example/1');

        await sendPushNotification({ ...baseArgs, roles: ['ADMIN'] });

        expect(mockedSend).not.toHaveBeenCalled();
    });

    it('supprime l\'abonnement expiré (410/404) et poursuit les autres envois', async () => {
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'a1@test.com' });
        await seedUserRole('admin-1', 'ADMIN');
        await seedSubscription('gone', 'admin-1', 'https://push.example/gone');
        await seedSubscription('missing', 'admin-1', 'https://push.example/missing');
        await seedSubscription('ok', 'admin-1', 'https://push.example/ok');
        mockedSend.mockImplementation(async (subscription) => {
            const endpoint = (subscription as { endpoint: string }).endpoint;
            if (endpoint.endsWith('/gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
            if (endpoint.endsWith('/missing')) throw Object.assign(new Error('Not found'), { statusCode: 404 });
            return { statusCode: 201, body: '', headers: {} };
        });

        const result = await sendPushNotification({ ...baseArgs, roles: ['ADMIN'] });

        expect(result).toBe(true);
        expect(mockedSend).toHaveBeenCalledTimes(3);
        const remaining = await db.execute(`SELECT id FROM "PushSubscription"`);
        expect(remaining.rows.map(r => r.id)).toEqual(['ok']);
    });

    it('conserve l\'abonnement et retourne true sur une autre erreur (500 / réseau)', async () => {
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'a1@test.com' });
        await seedUserRole('admin-1', 'ADMIN');
        await seedSubscription('s1', 'admin-1', 'https://push.example/1');
        mockedSend.mockRejectedValue(Object.assign(new Error('Server error'), { statusCode: 500 }));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await sendPushNotification({ ...baseArgs, roles: ['ADMIN'] });

        expect(result).toBe(true);
        expect(errorSpy).toHaveBeenCalled();
        const remaining = await db.execute(`SELECT id FROM "PushSubscription"`);
        expect(remaining.rows).toHaveLength(1);
        const notifs = await db.execute(`SELECT id FROM "Notification"`);
        expect(notifs.rows).toHaveLength(1);
    });

    it('crée l\'in-app sans envoyer de push (warn) si les clés VAPID sont absentes', async () => {
        delete process.env.VAPID_PUBLIC_KEY;
        delete process.env.VAPID_PRIVATE_KEY;
        delete process.env.VAPID_SUBJECT;
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'a1@test.com' });
        await seedUserRole('admin-1', 'ADMIN');
        await seedSubscription('s1', 'admin-1', 'https://push.example/1');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await sendPushNotification({ ...baseArgs, roles: ['ADMIN'] });

        expect(result).toBe(true);
        expect(warnSpy).toHaveBeenCalled();
        expect(mockedSend).not.toHaveBeenCalled();
        const notifs = await db.execute(`SELECT id FROM "Notification"`);
        expect(notifs.rows).toHaveLength(1);
    });
});
