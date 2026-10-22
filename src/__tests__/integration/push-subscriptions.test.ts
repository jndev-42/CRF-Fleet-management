/**
 * Tests d'intégration — POST/DELETE /api/push/subscriptions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST, DELETE } from '@/app/api/push/subscriptions/route';
import { auth } from '@/auth';
import { db, seedUser } from './setup';

const mockedAuth = vi.mocked(auth as unknown as () => Promise<unknown>);

const validBody = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

function makeRequest(method: 'POST' | 'DELETE', body: unknown): Request {
    return new Request('http://localhost/api/push/subscriptions', {
        method,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'TestBrowser/1.0' },
        body: JSON.stringify(body),
    });
}

function sessionFor(id: string, roles: string[] = ['CHVL']) {
    return { user: { id, email: `${id}@test.com`, roles, ulId: 'ul-paris-18' } };
}

beforeEach(async () => {
    mockedAuth.mockReset();
    await seedUser({ id: 'user-1', email: 'user-1@test.com' });
    await seedUser({ id: 'user-2', email: 'user-2@test.com' });
});

describe('POST /api/push/subscriptions', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null);
        const res = await POST(makeRequest('POST', validBody));
        expect(res.status).toBe(401);
    });

    it('403 pour un compte INACTIF', async () => {
        mockedAuth.mockResolvedValue(sessionFor('user-1', ['INACTIF']));
        const res = await POST(makeRequest('POST', validBody));
        expect(res.status).toBe(403);
        const rows = await db.execute(`SELECT id FROM "PushSubscription"`);
        expect(rows.rows).toHaveLength(0);
    });

    it('400 si keys.p256dh est absent', async () => {
        mockedAuth.mockResolvedValue(sessionFor('user-1'));
        const res = await POST(makeRequest('POST', { endpoint: validBody.endpoint, keys: { auth: 'x' } }));
        expect(res.status).toBe(400);
    });

    it('400 si l\'endpoint n\'est pas une URL https', async () => {
        mockedAuth.mockResolvedValue(sessionFor('user-1'));
        const res = await POST(makeRequest('POST', { ...validBody, endpoint: 'http://internal.local/hook' }));
        expect(res.status).toBe(400);
    });

    it.each([
        'https://evil.example.com/push',
        'https://169.254.169.254/latest/meta-data',
        'https://fcm.googleapis.com.evil.example/x',
        'https://evilnotify.windows.com.example/x',
        'https://notify.windows.com/x',
    ])('400 si l\'endpoint (%s) n\'est pas un service push de navigateur', async (endpoint) => {
        mockedAuth.mockResolvedValue(sessionFor('user-1'));
        const res = await POST(makeRequest('POST', { ...validBody, endpoint }));
        expect(res.status).toBe(400);
        const rows = await db.execute(`SELECT id FROM "PushSubscription"`);
        expect(rows.rows).toHaveLength(0);
    });

    it.each([
        'https://updates.push.services.mozilla.com/wpush/v2/abc',
        'https://db5p.notify.windows.com/?token=abc',
        'https://web.push.apple.com/abc',
    ])('200 pour l\'endpoint de service push %s', async (endpoint) => {
        mockedAuth.mockResolvedValue(sessionFor('user-1'));
        const res = await POST(makeRequest('POST', { ...validBody, endpoint }));
        expect(res.status).toBe(200);
    });

    it('200 : enregistre l\'abonnement de l\'utilisateur', async () => {
        mockedAuth.mockResolvedValue(sessionFor('user-1'));
        const res = await POST(makeRequest('POST', validBody));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });
        const rows = await db.execute(`SELECT userId, endpoint, p256dh, auth, userAgent FROM "PushSubscription"`);
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0]).toMatchObject({
            userId: 'user-1',
            endpoint: validBody.endpoint,
            p256dh: 'p256dh-key',
            auth: 'auth-key',
            userAgent: 'TestBrowser/1.0',
        });
    });

    it('réattribue la ligne au nouvel utilisateur pour un même endpoint (upsert)', async () => {
        mockedAuth.mockResolvedValue(sessionFor('user-1'));
        await POST(makeRequest('POST', validBody));
        mockedAuth.mockResolvedValue(sessionFor('user-2'));
        const res = await POST(makeRequest('POST', { ...validBody, keys: { p256dh: 'new-p', auth: 'new-a' } }));

        expect(res.status).toBe(200);
        const rows = await db.execute(`SELECT userId, p256dh, auth FROM "PushSubscription"`);
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0]).toMatchObject({ userId: 'user-2', p256dh: 'new-p', auth: 'new-a' });
    });
});

describe('DELETE /api/push/subscriptions', () => {
    async function seedSubscription(userId: string) {
        await db.execute({
            sql: `INSERT INTO "PushSubscription" (id, userId, endpoint, p256dh, auth) VALUES ('sub-1', ?, ?, 'p', 'a')`,
            args: [userId, validBody.endpoint],
        });
    }

    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null);
        const res = await DELETE(makeRequest('DELETE', { endpoint: validBody.endpoint }));
        expect(res.status).toBe(401);
    });

    it('403 pour un compte INACTIF', async () => {
        mockedAuth.mockResolvedValue(sessionFor('user-1', ['INACTIF']));
        const res = await DELETE(makeRequest('DELETE', { endpoint: validBody.endpoint }));
        expect(res.status).toBe(403);
    });

    it('400 sans endpoint', async () => {
        mockedAuth.mockResolvedValue(sessionFor('user-1'));
        const res = await DELETE(makeRequest('DELETE', {}));
        expect(res.status).toBe(400);
    });

    it('200 : supprime l\'abonnement du propriétaire', async () => {
        await seedSubscription('user-1');
        mockedAuth.mockResolvedValue(sessionFor('user-1'));
        const res = await DELETE(makeRequest('DELETE', { endpoint: validBody.endpoint }));
        expect(res.status).toBe(200);
        const rows = await db.execute(`SELECT id FROM "PushSubscription"`);
        expect(rows.rows).toHaveLength(0);
    });

    it('404 et abonnement conservé si l\'endpoint appartient à un autre utilisateur', async () => {
        await seedSubscription('user-1');
        mockedAuth.mockResolvedValue(sessionFor('user-2'));
        const res = await DELETE(makeRequest('DELETE', { endpoint: validBody.endpoint }));
        expect(res.status).toBe(404);
        const rows = await db.execute(`SELECT id FROM "PushSubscription"`);
        expect(rows.rows).toHaveLength(1);
    });
});
