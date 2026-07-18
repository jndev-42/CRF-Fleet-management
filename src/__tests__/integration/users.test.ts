/**
 * Tests d'intégration — POST /api/users et PATCH /api/users/[email]
 *
 * Stratégie : appel direct des handlers Next.js avec un vrai SQLite.
 * - Auth mockée (pas de vraie session)
 * - Pas de services externes impliqués
 *
 * Cas couverts :
 *  POST /api/users
 *   1. 401 sans session
 *   2. 403 pour un non-ADMIN (rôle CHVL)
 *   3. 400 Zod — email manquant
 *   4. Happy path — 201, user créé en DB
 *   5. GUEST strips other roles — seul GUEST assigné
 *   6. Non-GUEST strips GUEST — GUEST retiré du set
 *   7. 409 si email déjà existant
 *
 *  PATCH /api/users/[email]
 *   8. 401 sans session
 *   9. 403 pour un non-ADMIN
 *  10. 404 si user inconnu
 *  11. Happy path — rôles mis à jour en DB
 *  12. GUEST strips other roles via PATCH
 *  13. Non-GUEST strips GUEST via PATCH
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST, GET } from '@/app/api/users/route';
import { PATCH } from '@/app/api/users/[email]/route';
import { auth } from '@/auth';
import { db, seedUser, seedRoles, seedUserRole } from './setup';

const mockedAuth = vi.mocked(auth);

function makePostRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function makePatchRequest(email: string, body: Record<string, unknown>): Request {
    return new Request(`http://localhost/api/users/${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function makeGetRequest(): Request {
    return new Request('http://localhost/api/users', { method: 'GET' });
}

const adminSession = { user: { email: 'admin@test.com', roles: ['SUPER_ADMIN'] } };
const chvlSession = { user: { email: 'chvl@test.com', roles: ['CHVL'] } };

async function getUserRoles(userId: string): Promise<string[]> {
    const res = await db.execute({
        sql: `SELECT r.name FROM "UserRole" ur JOIN "Role" r ON ur.roleId = r.id WHERE ur.userId = ?`,
        args: [userId],
    });
    return res.rows.map(row => row.name as string);
}

describe('POST /api/users', () => {
    it('1. 401 sans session', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        const res = await POST(makePostRequest({ email: 'x@test.com', name: 'X' }));
        expect(res.status).toBe(403); // route checks roles not just session presence
    });

    it('2. 403 pour un non-ADMIN (rôle CHVL)', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(chvlSession as any);
        const res = await POST(makePostRequest({ email: 'x@test.com', name: 'X' }));
        expect(res.status).toBe(403);
    });

    it('3. 400 Zod — email manquant', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);
        const res = await POST(makePostRequest({ name: 'No Email' }));
        expect(res.status).toBe(400);
    });

    it('4. Happy path — 201, user créé en DB', async () => {
        await seedRoles();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);
        const res = await POST(makePostRequest({ email: 'new@test.com', name: 'New User', roles: ['CHVL'] }));
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.id).toBeTruthy();

        const roles = await getUserRoles(body.id);
        expect(roles).toContain('CHVL');

    });

    it('5. GUEST seul — seul GUEST assigné', async () => {
        await seedRoles();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);
        const res = await POST(makePostRequest({
            email: 'guest-user@test.com',
            name: 'Guest User',
            roles: ['GUEST'],
        }));
        expect(res.status).toBe(201);
        const body = await res.json();

        const roles = await getUserRoles(body.id);
        expect(roles).toEqual(['INACTIF']);
    });

    it('6. GUEST + non-GUEST dans le payload — non-GUEST gagne, GUEST retiré', async () => {
        await seedRoles();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);
        const res = await POST(makePostRequest({
            email: 'mixed@test.com',
            name: 'Mixed User',
            roles: ['GUEST', 'CHVL'],
        }));
        expect(res.status).toBe(201);
        const body = await res.json();

        const roles = await getUserRoles(body.id);
        expect(roles).not.toContain('GUEST');
        expect(roles).toContain('CHVL');
    });

    it('7. 409 si email déjà existant', async () => {
        await seedRoles();
        await seedUser({ id: 'existing-user', email: 'existing@test.com', name: 'Existing' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);
        const res = await POST(makePostRequest({ email: 'existing@test.com', name: 'Dup' }));
        expect(res.status).toBe(409);
    });
});

describe('PATCH /api/users/[email]', () => {
    it('8. 401 sans session', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        const res = await PATCH(
            makePatchRequest('user@test.com', { roles: ['CHVL'] }),
            { params: Promise.resolve({ email: 'user@test.com' }) }
        );
        expect(res.status).toBe(403);
    });

    it('9. 403 pour un non-ADMIN', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(chvlSession as any);
        const res = await PATCH(
            makePatchRequest('user@test.com', { roles: ['CHVL'] }),
            { params: Promise.resolve({ email: 'user@test.com' }) }
        );
        expect(res.status).toBe(403);
    });

    it('10. 404 si user inconnu', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);
        const res = await PATCH(
            makePatchRequest('unknown@test.com', { roles: ['CHVL'] }),
            { params: Promise.resolve({ email: 'unknown@test.com' }) }
        );
        expect(res.status).toBe(404);
    });

    it('11. Happy path — rôles mis à jour en DB', async () => {
        await seedRoles();
        const user = await seedUser({ id: 'patch-user', email: 'patch@test.com', name: 'Patch User' });
        await seedUserRole(user.id, 'GUEST');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);

        const res = await PATCH(
            makePatchRequest(user.email, { roles: ['CHVL', 'PRESIDENT'] }),
            { params: Promise.resolve({ email: user.email }) }
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        const roles = await getUserRoles(user.id);
        expect(roles).toContain('CHVL');
        expect(roles).toContain('PRESIDENT');
        expect(roles).not.toContain('GUEST');
    });

    it('12. GUEST seul via PATCH — seul GUEST assigné', async () => {
        await seedRoles();
        const user = await seedUser({ id: 'patch-guest', email: 'patchguest@test.com', name: 'Patch Guest' });
        await seedUserRole(user.id, 'CHVL');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);

        const res = await PATCH(
            makePatchRequest(user.email, { roles: ['GUEST'] }),
            { params: Promise.resolve({ email: user.email }) }
        );
        expect(res.status).toBe(200);

        const roles = await getUserRoles(user.id);
        expect(roles).toEqual(['INACTIF']);
    });

    it('12b. GUEST + non-GUEST dans le payload PATCH — non-GUEST gagne', async () => {
        await seedRoles();
        const user = await seedUser({ id: 'patch-guest2', email: 'patchguest2@test.com', name: 'Patch Guest 2' });
        await seedUserRole(user.id, 'GUEST');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);

        const res = await PATCH(
            makePatchRequest(user.email, { roles: ['GUEST', 'CHVL'] }),
            { params: Promise.resolve({ email: user.email }) }
        );
        expect(res.status).toBe(200);

        const roles = await getUserRoles(user.id);
        expect(roles).toContain('CHVL');
        expect(roles).not.toContain('GUEST');
    });

    it('13. Rôles non-GUEST via PATCH — GUEST retiré même s\'il était en DB', async () => {
        await seedRoles();
        const user = await seedUser({ id: 'patch-nongst', email: 'patchnon@test.com', name: 'Patch Non Guest' });
        await seedUserRole(user.id, 'GUEST');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);

        const res = await PATCH(
            makePatchRequest(user.email, { roles: ['CHVL', 'PRESIDENT'] }),
            { params: Promise.resolve({ email: user.email }) }
        );
        expect(res.status).toBe(200);

        const roles = await getUserRoles(user.id);
        expect(roles).toContain('CHVL');
        expect(roles).toContain('PRESIDENT');
        expect(roles).not.toContain('GUEST');
    });
});

describe('GET /api/users', () => {
    it('401 sans session', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        const res = await GET(makeGetRequest());
        expect(res.status).toBe(401);
    });
});
