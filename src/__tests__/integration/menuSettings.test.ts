import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET } from '@/app/api/settings/menus/route';
import { PATCH } from '@/app/api/settings/menus/[key]/route';
import { seedRoles, seedUser, seedUserRole, seedMenuSettings, db } from './setup';

const mockedAuth = vi.mocked(auth);

function makePatchRequest(key: string, body: Record<string, unknown>): Request {
    return new Request(`http://localhost/api/settings/menus/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function callPatch(key: string, body: Record<string, unknown>) {
    const req = makePatchRequest(key, body);
    return PATCH(req, { params: Promise.resolve({ key }) });
}

beforeEach(async () => {
    await seedRoles();
    await seedUser({ id: 'user-admin', email: 'admin@test.com' });
    await seedUserRole('user-admin', 'SUPER_ADMIN');
    await seedUser({ id: 'user-readonlymgr', email: 'president@test.com' });
    await seedUserRole('user-readonlymgr', 'PRESIDENT');
    await seedUser({ id: 'user-chvl', email: 'chvl@test.com' });
    await seedUserRole('user-chvl', 'CHVL');
    await seedMenuSettings();
});

describe('GET /api/settings/menus', () => {
    it('returns 401 when unauthenticated', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('returns 403 for non-ADMIN user (CHVL)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'chvl@test.com', roles: ['CHVL'] } } as never);
        const res = await GET();
        expect(res.status).toBe(403);
    });

    it('returns 403 for PRESIDENT (lecture seule, pas de gestion modules)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
        const res = await GET();
        expect(res.status).toBe(403);
    });

    it('returns 3 settings with available visibility for ADMIN', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['SUPER_ADMIN'] } } as never);
        const res = await GET();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.settings).toHaveLength(3);
        const keys = data.settings.map((s: { menu_key: string }) => s.menu_key);
        expect(keys).toContain('stats');
        expect(keys).toContain('inventory');
        expect(keys).toContain('missions');
        for (const s of data.settings) {
            expect(s.visibility).toBe('available');
        }
    });
});

describe('PATCH /api/settings/menus/[key]', () => {
    it('returns 401 when unauthenticated', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        const res = await callPatch('stats', { visibility: 'disabled' });
        expect(res.status).toBe(401);
    });

    it('returns 403 for PRESIDENT (lecture seule, pas de gestion modules)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
        const res = await callPatch('stats', { visibility: 'disabled' });
        expect(res.status).toBe(403);
    });

    it('returns 400 for unknown key', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['SUPER_ADMIN'] } } as never);
        const res = await callPatch('unknown_key', { visibility: 'available' });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/invalide/i);
    });

    it('returns 400 for invalid visibility value (Zod)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['SUPER_ADMIN'] } } as never);
        const res = await callPatch('stats', { visibility: 'invalid_value' });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.details).toBeDefined();
    });

    it('happy path — ADMIN can update visibility and DB is updated', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['SUPER_ADMIN'] } } as never);
        const res = await callPatch('stats', { visibility: 'admin_only' });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);

        // Verify DB was updated
        const row = await db.execute({
            sql: `SELECT visibility FROM "MenuSetting" WHERE menu_key = ?`,
            args: ['stats'],
        });
        expect(row.rows[0].visibility).toBe('admin_only');
    });

    it('ADMIN can set visibility to disabled', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['SUPER_ADMIN'] } } as never);
        const res = await callPatch('inventory', { visibility: 'disabled' });
        expect(res.status).toBe(200);

        const row = await db.execute({
            sql: `SELECT visibility FROM "MenuSetting" WHERE menu_key = ?`,
            args: ['inventory'],
        });
        expect(row.rows[0].visibility).toBe('disabled');
    });

    it('ADMIN can update missions visibility', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['SUPER_ADMIN'] } } as never);
        const res = await callPatch('missions', { visibility: 'admin_only' });
        expect(res.status).toBe(200);

        const row = await db.execute({
            sql: `SELECT visibility FROM "MenuSetting" WHERE menu_key = ?`,
            args: ['missions'],
        });
        expect(row.rows[0].visibility).toBe('admin_only');
    });
});
