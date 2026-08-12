/**
 * Tests d'intégration — src/lib/onesignal.ts (sendPushNotification).
 * DB réelle (création des notifications in-app), fetch mocké (appel OneSignal externe).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

import { sendPushNotification } from '@/lib/onesignal';
import { db, seedRoles, seedUser, seedUserRole } from './setup';

describe('sendPushNotification', () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;
    const mockFetch = vi.fn();

    beforeEach(() => {
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') });
        global.fetch = mockFetch as unknown as typeof fetch;
        process.env.ONESIGNAL_ID = 'app-id';
        process.env.ONESIGNAL_API_KEY = 'api-key';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        global.fetch = originalFetch;
    });

    it('crée une notification in-app pour chaque utilisateur ciblé par rôle', async () => {
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'admin@test.com' });
        await seedUserRole('admin-1', 'ADMIN');
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedUserRole('user-1', 'CHVL');

        const result = await sendPushNotification({
            tags: [{ field: 'tag', key: 'role_ADMIN', relation: '=', value: 'true' }],
            headings: { fr: 'Titre' },
            contents: { fr: 'Message' },
        });

        expect(result).toBe(true);
        const notifs = await db.execute({ sql: `SELECT userId FROM "Notification"`, args: [] });
        expect(notifs.rows).toHaveLength(1);
        expect(notifs.rows[0].userId).toBe('admin-1');
    });

    it('étend le rôle ADMIN vers SUPER_ADMIN et ADMIN', async () => {
        await seedRoles();
        await seedUser({ id: 'super-1', email: 'super@test.com' });
        await seedUserRole('super-1', 'SUPER_ADMIN');

        await sendPushNotification({
            tags: [{ field: 'tag', key: 'role_ADMIN', relation: '=', value: 'true' }],
            headings: { fr: 'Titre' },
            contents: { fr: 'Message' },
        });

        const notifs = await db.execute({ sql: `SELECT userId FROM "Notification"`, args: [] });
        expect(notifs.rows.map(r => r.userId)).toContain('super-1');
    });

    it('retourne true sans appeler OneSignal si les identifiants ne sont pas configurés', async () => {
        delete process.env.ONESIGNAL_ID;
        delete process.env.ONESIGNAL_API_KEY;
        await seedRoles();

        const result = await sendPushNotification({
            tags: [{ field: 'tag', key: 'role_ADMIN', relation: '=', value: 'true' }],
            headings: { fr: 'Titre' },
            contents: { fr: 'Message' },
        });

        expect(result).toBe(true);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('retourne false si l\'appel OneSignal échoue', async () => {
        await seedRoles();
        mockFetch.mockResolvedValue({ ok: false, text: () => Promise.resolve('Erreur OneSignal') });

        const result = await sendPushNotification({
            tags: [{ field: 'tag', key: 'role_ADMIN', relation: '=', value: 'true' }],
            headings: { fr: 'Titre' },
            contents: { fr: 'Message' },
        });

        expect(result).toBe(false);
    });

    it('appelle l\'API OneSignal avec les bons paramètres (happy path)', async () => {
        await seedRoles();

        await sendPushNotification({
            tags: [{ field: 'tag', key: 'role_ADMIN', relation: '=', value: 'true' }],
            headings: { fr: 'Titre' },
            contents: { fr: 'Message' },
            url: 'https://example.com/vehicles/VL186',
        });

        expect(mockFetch).toHaveBeenCalledWith(
            'https://onesignal.com/api/v1/notifications',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'Basic api-key' }),
            })
        );
        const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
        expect(callBody.app_id).toBe('app-id');
        expect(callBody.url).toBe('https://example.com/vehicles/VL186?fromPush=true');
    });
});
