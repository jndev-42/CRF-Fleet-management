import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET } from '@/app/api/settings/modules/route';
import { PATCH } from '@/app/api/settings/modules/[key]/route';
import { seedRoles, seedUser, seedUserRole, seedModuleSettings, db } from './setup';

const mockedAuth = vi.mocked(auth);

function makePatchRequest(key: string, body: Record<string, unknown>): Request {
    return new Request(`http://localhost/api/settings/modules/${key}`, {
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
    await seedUserRole('user-admin', 'ADMIN');
    await seedUser({ id: 'user-respo', email: 'respo@test.com' });
    await seedUserRole('user-respo', 'RESPO');
    await seedUser({ id: 'user-chvl', email: 'chvl@test.com' });
    await seedUserRole('user-chvl', 'CHVL');
    await seedModuleSettings();
});

describe('GET /api/settings/modules', () => {
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

    it('returns 403 for RESPO', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'respo@test.com', roles: ['RESPO'] } } as never);
        const res = await GET();
        expect(res.status).toBe(403);
    });

    it('returns settings for ADMIN', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        const res = await GET();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.settings).toHaveLength(3);
        const stats = data.settings.find((s: any) => s.module_key === 'stats');
        expect(stats.allowed_roles).toContain('CHVL');
    });
});

describe('PATCH /api/settings/modules/[key]', () => {
    it('returns 401 when unauthenticated', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        const res = await callPatch('stats', { allowed_roles: ['ADMIN'] });
        expect(res.status).toBe(401);
    });

    it('returns 403 for RESPO', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'respo@test.com', roles: ['RESPO'] } } as never);
        const res = await callPatch('stats', { allowed_roles: ['ADMIN'] });
        expect(res.status).toBe(403);
    });

    it('returns 400 for unknown key', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        const res = await callPatch('unknown_key', { allowed_roles: ['ADMIN'] });
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/invalide/i);
    });

    it('happy path — ADMIN can update allowed roles', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        const res = await callPatch('stats', { allowed_roles: ['ADMIN', 'RESPO'] });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);

        // Verify DB was updated
        const row = await db.execute({
            sql: `SELECT allowed_roles FROM "ModuleSetting" WHERE module_key = ?`,
            args: ['stats'],
        });
        expect(JSON.parse(row.rows[0].allowed_roles as string)).toEqual(['ADMIN', 'RESPO']);
    });
});
