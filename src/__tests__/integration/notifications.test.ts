/**
 * Tests d'intégration — GET/DELETE /api/notifications, DELETE /api/notifications/[id]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET, DELETE as DELETE_ALL } from '@/app/api/notifications/route';
import { DELETE as DELETE_ONE } from '@/app/api/notifications/[id]/route';
import { auth } from '@/auth';
import { db, seedUser, seedNotification } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

describe('GET /api/notifications', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('retourne les notifications de l\'utilisateur pour son UL active', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedNotification({ id: 'notif-1', userId: 'user-1', ulId: 'ul-paris-18', title: 'Titre 1' });
        await seedNotification({ id: 'notif-2', userId: 'user-1', ulId: 'ul-lyon-3', title: 'Titre autre UL' });

        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.notifications).toHaveLength(1);
        expect(body.notifications[0].title).toBe('Titre 1');
    });

    it('retourne 404 pour un compte inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'inconnu@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await GET();
        expect(res.status).toBe(404);
    });

    it('retourne une liste vide pour un compte sans notification dans son UL active', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedNotification({ id: 'notif-1', userId: 'user-1', ulId: 'ul-lyon-3' });

        const res = await GET();
        expect(res.status).toBe(200);
        expect((await res.json()).notifications).toEqual([]);
    });

    it('ne retourne jamais les notifications d\'une autre personne de la même UL', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedUser({ id: 'user-2', email: 'autre@test.com' });
        await seedNotification({ id: 'notif-1', userId: 'user-1', ulId: 'ul-paris-18' });
        await seedNotification({ id: 'notif-2', userId: 'user-2', ulId: 'ul-paris-18' });

        const body = await (await GET()).json();
        expect(body.notifications.map((n: { id: string }) => n.id)).toEqual(['notif-1']);
    });

    it('trie de la plus récente à la plus ancienne et garde la forme de la réponse', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedNotification({ id: 'ancienne', userId: 'user-1', ulId: 'ul-paris-18' });
        await seedNotification({ id: 'recente', userId: 'user-1', ulId: 'ul-paris-18' });
        await db.execute(`UPDATE "Notification" SET createdAt = '2026-01-01 08:00:00' WHERE id = 'ancienne'`);
        await db.execute(`UPDATE "Notification" SET createdAt = '2026-02-01 08:00:00' WHERE id = 'recente'`);

        const body = await (await GET()).json();
        expect(body.notifications.map((n: { id: string }) => n.id)).toEqual(['recente', 'ancienne']);
        expect(body.notifications[0]).toMatchObject({ isRead: false, createdAt: '2026-02-01T08:00:00.000Z' });
        expect(Object.keys(body.notifications[0]).sort()).toEqual(['createdAt', 'id', 'isRead', 'message', 'title', 'url']);
    });
});

describe('DELETE /api/notifications', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await DELETE_ALL();
        expect(res.status).toBe(401);
    });

    it('efface toutes les notifications de l\'UL active', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedNotification({ id: 'notif-1', userId: 'user-1', ulId: 'ul-paris-18' });

        const res = await DELETE_ALL();
        expect(res.status).toBe(200);

        const after = await GET();
        const body = await after.json();
        expect(body.notifications).toHaveLength(0);
    });
});

describe('DELETE /api/notifications/[id]', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await DELETE_ONE(new Request('http://localhost/api/notifications/notif-1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'notif-1' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 404 si la notification n\'appartient pas à l\'utilisateur', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedUser({ id: 'user-2', email: 'autre@test.com' });
        await seedNotification({ id: 'notif-1', userId: 'user-2' });

        const res = await DELETE_ONE(new Request('http://localhost/api/notifications/notif-1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'notif-1' }) });
        expect(res.status).toBe(404);
    });

    it('supprime la notification de l\'utilisateur (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedNotification({ id: 'notif-1', userId: 'user-1' });

        const res = await DELETE_ONE(new Request('http://localhost/api/notifications/notif-1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'notif-1' }) });
        expect(res.status).toBe(200);
    });
});
