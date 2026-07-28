import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET, POST } from '@/app/api/banners/route';
import { PATCH, DELETE } from '@/app/api/banners/[id]/route';
import { seedRoles, seedUser, seedUserRole, seedUniteLocale, db } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(async () => {
    // Clear banners table
    await db.execute('DELETE FROM "CommunicationBanner"');
    await db.execute('DELETE FROM "UserRole"');
    await db.execute('DELETE FROM "User"');
    await db.execute('DELETE FROM "UniteLocale"');

    await seedUniteLocale({ id: 'ul-1', name: 'UL 1', slug: 'ul-1' });
    await seedUniteLocale({ id: 'ul-2', name: 'UL 2', slug: 'ul-2' });
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });

    await seedRoles();
    await seedUser({ id: 'user-super-admin', email: 'superadmin@test.com' });
    await seedUserRole('user-super-admin', 'SUPER_ADMIN');

    await seedUser({ id: 'user-admin', email: 'admin@test.com' });
    await seedUserRole('user-admin', 'ADMIN');

    await seedUser({ id: 'user-president', email: 'president@test.com' });
    await seedUserRole('user-president', 'PRESIDENT');

    await seedUser({ id: 'user-cadre', email: 'cadre@test.com' });
    await seedUserRole('user-cadre', 'CADRE');

    await seedUser({ id: 'user-chvl', email: 'chvl@test.com' });
    await seedUserRole('user-chvl', 'CHVL');
});

describe('GET /api/banners', () => {
    it('returns 401 when unauthenticated', async () => {
        // @ts-expect-error null session
        mockedAuth.mockResolvedValue(null);
        const res = await GET(new Request('http://localhost/api/banners'));
        expect(res.status).toBe(401);
    });

    it('returns active banners (global + active UL) for logged in user', async () => {
        mockedAuth.mockResolvedValue({
            user: { id: 'user-chvl', email: 'chvl@test.com', roles: ['CHVL'], ulId: 'ul-1' }
        } as never);

        // Insert global banner
        await db.execute({
            sql: `INSERT INTO "CommunicationBanner" (id, title, message, target_page, type, is_global, is_active, created_by)
                  VALUES ('b-global', 'Titre Global', 'Message Global', 'ALL', 'info', 1, 1, 'user-super-admin')`,
            args: []
        });

        // Insert UL-1 banner
        await db.execute({
            sql: `INSERT INTO "CommunicationBanner" (id, title, message, target_page, type, ul_id, is_global, is_active, created_by)
                  VALUES ('b-ul1', 'Titre UL1', 'Message UL1', 'VEHICLES', 'warning', 'ul-1', 0, 1, 'user-admin')`,
            args: []
        });

        // Insert UL-2 banner (other UL)
        await db.execute({
            sql: `INSERT INTO "CommunicationBanner" (id, title, message, target_page, type, ul_id, is_global, is_active, created_by)
                  VALUES ('b-ul2', 'Titre UL2', 'Message UL2', 'MISSIONS', 'danger', 'ul-2', 0, 1, 'user-admin')`,
            args: []
        });

        // Insert inactive banner
        await db.execute({
            sql: `INSERT INTO "CommunicationBanner" (id, title, message, target_page, type, ul_id, is_global, is_active, created_by)
                  VALUES ('b-inactive', 'Inactif', 'Message Inactif', 'ALL', 'info', 'ul-1', 0, 0, 'user-admin')`,
            args: []
        });

        const res = await GET(new Request('http://localhost/api/banners?ulId=ul-1'));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.banners).toHaveLength(2);
        const ids = data.banners.map((b: { id: string }) => b.id);
        expect(ids).toContain('b-global');
        expect(ids).toContain('b-ul1');
        expect(ids).not.toContain('b-ul2');
        expect(ids).not.toContain('b-inactive');
    });

    it('admin mode returns 403 for CHVL user', async () => {
        mockedAuth.mockResolvedValue({
            user: { id: 'user-chvl', email: 'chvl@test.com', roles: ['CHVL'], ulId: 'ul-1' }
        } as never);

        const res = await GET(new Request('http://localhost/api/banners?admin=true'));
        expect(res.status).toBe(403);
    });

    it('admin mode allows PRESIDENT / CADRE / ADMIN / SUPER_ADMIN', async () => {
        mockedAuth.mockResolvedValue({
            user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'], ulId: 'ul-1' }
        } as never);

        const res = await GET(new Request('http://localhost/api/banners?admin=true'));
        expect(res.status).toBe(200);
    });
});

describe('POST /api/banners', () => {
    it('returns 401 when unauthenticated', async () => {
        // @ts-expect-error null session
        mockedAuth.mockResolvedValue(null);
        const req = new Request('http://localhost/api/banners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Hello' })
        });
        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it('returns 403 for unauthorized roles', async () => {
        mockedAuth.mockResolvedValue({
            user: { id: 'user-chvl', email: 'chvl@test.com', roles: ['CHVL'], ulId: 'ul-1' }
        } as never);

        const req = new Request('http://localhost/api/banners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Hello' })
        });
        const res = await POST(req);
        expect(res.status).toBe(403);
    });

    it('returns 400 when message is empty', async () => {
        mockedAuth.mockResolvedValue({
            user: { id: 'user-admin', email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-1' }
        } as never);

        const req = new Request('http://localhost/api/banners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: '   ' })
        });
        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it('allows ADMIN to create banner for their UL (forcing is_global = false)', async () => {
        mockedAuth.mockResolvedValue({
            user: { id: 'user-admin', email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' }
        } as never);

        const req = new Request('http://localhost/api/banners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Avis travaux',
                message: 'Travaux au parking Baigneur.',
                target_page: 'VEHICLES',
                type: 'warning',
                is_global: true, // Should be overridden to false for non-superadmin!
            })
        });

        const res = await POST(req);
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.banner.is_global).toBe(false);
        expect(data.banner.ul_id).toBe('ul-paris-18');
        expect(data.banner.target_page).toBe('VEHICLES');
    });

    it('allows SUPER_ADMIN to create global banner', async () => {
        mockedAuth.mockResolvedValue({
            user: { id: 'user-super-admin', email: 'superadmin@test.com', roles: ['SUPER_ADMIN'] }
        } as never);

        const req = new Request('http://localhost/api/banners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Alerte météo nationale',
                message: 'Vigilance orange neige.',
                target_page: 'ALL',
                type: 'danger',
                is_global: true,
            })
        });

        const res = await POST(req);
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.banner.is_global).toBe(true);
        expect(data.banner.ul_id).toBeNull();
    });
});

describe('PATCH & DELETE /api/banners/[id]', () => {
    it('allows ADMIN to edit their UL banner', async () => {
        mockedAuth.mockResolvedValue({
            user: { id: 'user-admin', email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-1' }
        } as never);

        await db.execute({
            sql: `INSERT INTO "CommunicationBanner" (id, title, message, target_page, type, ul_id, is_global, is_active, created_by)
                  VALUES ('b-to-edit', 'Titre initial', 'Message initial', 'ALL', 'info', 'ul-1', 0, 1, 'user-admin')`,
            args: []
        });

        const req = new Request('http://localhost/api/banners/b-to-edit', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Message modifié',
                type: 'success',
                is_active: false,
            })
        });

        const res = await PATCH(req, { params: Promise.resolve({ id: 'b-to-edit' }) });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.banner.message).toBe('Message modifié');
        expect(data.banner.type).toBe('success');
        expect(data.banner.is_active).toBe(false);
    });

    it('rejects non-SUPER_ADMIN attempting to set is_global = true on update', async () => {
        mockedAuth.mockResolvedValue({
            user: { id: 'user-admin', email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-1' }
        } as never);

        await db.execute({
            sql: `INSERT INTO "CommunicationBanner" (id, title, message, target_page, type, ul_id, is_global, is_active, created_by)
                  VALUES ('b-to-edit-2', 'Titre', 'Message', 'ALL', 'info', 'ul-1', 0, 1, 'user-admin')`,
            args: []
        });

        const req = new Request('http://localhost/api/banners/b-to-edit-2', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_global: true })
        });

        const res = await PATCH(req, { params: Promise.resolve({ id: 'b-to-edit-2' }) });
        expect(res.status).toBe(403);
    });

    it('allows ADMIN to delete their UL banner', async () => {
        mockedAuth.mockResolvedValue({
            user: { id: 'user-admin', email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-1' }
        } as never);

        await db.execute({
            sql: `INSERT INTO "CommunicationBanner" (id, title, message, target_page, type, ul_id, is_global, is_active, created_by)
                  VALUES ('b-to-delete', 'Titre', 'Message', 'ALL', 'info', 'ul-1', 0, 1, 'user-admin')`,
            args: []
        });

        const req = new Request('http://localhost/api/banners/b-to-delete', {
            method: 'DELETE'
        });

        const res = await DELETE(req, { params: Promise.resolve({ id: 'b-to-delete' }) });
        expect(res.status).toBe(200);

        const check = await db.execute({
            sql: 'SELECT * FROM "CommunicationBanner" WHERE id = ?',
            args: ['b-to-delete']
        });
        expect(check.rows).toHaveLength(0);
    });
});
