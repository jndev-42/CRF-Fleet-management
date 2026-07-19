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
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST, GET } from '@/app/api/users/route';
import { PATCH, DELETE } from '@/app/api/users/[email]/route';
import { PUT as PUT_UL } from '@/app/api/users/[email]/ul/route';
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

describe('Local Admin Scope Restrictions', () => {
    const localAdminSession = { user: { email: 'localadmin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } };

    async function seedUL(id: string, name: string) {
        await db.execute({
            sql: `INSERT OR REPLACE INTO "UniteLocale" (id, name, slug) VALUES (?, ?, ?)`,
            args: [id, name, id]
        });
    }

    async function seedUserUL(userId: string, ulId: string, isHome: number, roles: string | null = null) {
        await db.execute({
            sql: `INSERT OR REPLACE INTO "UserUL" (userId, ulId, is_home, roles) VALUES (?, ?, ?, ?)`,
            args: [userId, ulId, isHome, roles]
        });
    }

    beforeEach(async () => {
        await seedUL('ul-paris-18', 'Paris 18');
        await seedUL('ul-marseille', 'Marseille');
    });

    it('1. POST /api/users — Local Admin can only assign user to their own UL', async () => {
        await seedRoles();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session
        mockedAuth.mockResolvedValue(localAdminSession as any);

        // Try creating user in another UL => should fail
        const resFail = await POST(makePostRequest({ email: 'someuser@test.com', name: 'Some User', ulId: 'ul-marseille' }));
        expect(resFail.status).toBe(403);

        // Try creating user in own UL => should succeed
        const resOk = await POST(makePostRequest({ email: 'someuser2@test.com', name: 'Some User 2', ulId: 'ul-paris-18' }));
        expect(resOk.status).toBe(201);
    });

    it('2. PATCH /api/users/[email] — Local Admin can only modify global roles if the user belongs to their UL', async () => {
        await seedRoles();
        const userA = await seedUser({ id: 'user-a', email: 'usera@test.com', name: 'User A' });
        await seedUserUL(userA.id, 'ul-paris-18', 1); // User belongs to Paris 18

        const userB = await seedUser({ id: 'user-b', email: 'userb@test.com', name: 'User B' });
        await seedUserUL(userB.id, 'ul-marseille', 1); // User belongs to Marseille

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session
        mockedAuth.mockResolvedValue(localAdminSession as any);

        // Edit user belonging to Marseille => should fail
        const resFail = await PATCH(
            makePatchRequest(userB.email, { roles: ['CHVL'] }),
            { params: Promise.resolve({ email: userB.email }) }
        );
        expect(resFail.status).toBe(403);

        // Edit user belonging to own UL => should succeed
        const resOk = await PATCH(
            makePatchRequest(userA.email, { roles: ['CHVL'] }),
            { params: Promise.resolve({ email: userA.email }) }
        );
        expect(resOk.status).toBe(200);
    });

    it('3. DELETE /api/users/[email] — Local Admin can only delete a user belonging to their UL', async () => {
        const userA = await seedUser({ id: 'user-del-a', email: 'userdela@test.com', name: 'User Del A' });
        await seedUserUL(userA.id, 'ul-paris-18', 1);

        const userB = await seedUser({ id: 'user-del-b', email: 'userdelb@test.com', name: 'User Del B' });
        await seedUserUL(userB.id, 'ul-marseille', 1);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session
        mockedAuth.mockResolvedValue(localAdminSession as any);

        const resFail = await DELETE(
            new Request(`http://localhost/api/users/${encodeURIComponent(userB.email)}`, { method: 'DELETE' }),
            { params: Promise.resolve({ email: userB.email }) }
        );
        expect(resFail.status).toBe(403);

        const resOk = await DELETE(
            new Request(`http://localhost/api/users/${encodeURIComponent(userA.email)}`, { method: 'DELETE' }),
            { params: Promise.resolve({ email: userA.email }) }
        );
        expect(resOk.status).toBe(200);
    });

    it('4. PUT /api/users/[email]/ul — Local Admin can add roles for their UL to a user from another UL but cannot touch other UL rights', async () => {
        await seedRoles();
        const userExternal = await seedUser({ id: 'user-ext', email: 'userext@test.com', name: 'User Ext' });
        await seedUserUL(userExternal.id, 'ul-marseille', 1, 'CHVL'); // home UL is Marseille

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session
        mockedAuth.mockResolvedValue(localAdminSession as any);

        // PUT request attempting to sync roles: wants to add rights for 'ul-paris-18' and keep 'ul-marseille'
        // Let's mock payload sending both or only 'ul-paris-18'
        const req = new Request(`http://localhost/api/users/${encodeURIComponent(userExternal.email)}/ul`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uls: [
                    { ulId: 'ul-marseille', isHome: true, roles: ['ADMIN'] }, // Try to edit Marseille (which local admin shouldn't be allowed to change)
                    { ulId: 'ul-paris-18', isHome: false, roles: ['PRESIDENT'] } // Add rights on own UL Paris 18
                ]
            })
        });

        const res = await PUT_UL(req, { params: Promise.resolve({ email: userExternal.email }) });
        expect(res.status).toBe(200);

        // Check DB:
        // Marseille should NOT be changed (should still be CHVL, and still be is_home = 1)
        // Paris 18 should be added as is_home = 0, roles = PRESIDENT
        const dbRes = await db.execute({
            sql: `SELECT ulId, is_home, roles FROM "UserUL" WHERE userId = ? ORDER BY ulId`,
            args: [userExternal.id]
        });

        expect(dbRes.rows).toHaveLength(2);
        const rowMarseille = dbRes.rows.find(r => r.ulId === 'ul-marseille');
        const rowParis = dbRes.rows.find(r => r.ulId === 'ul-paris-18');

        expect(rowMarseille).toBeTruthy();
        expect(rowMarseille!.is_home).toBe(1);
        expect(rowMarseille!.roles).toBe('CHVL'); // Not changed to ADMIN!

        expect(rowParis).toBeTruthy();
        expect(rowParis!.is_home).toBe(0);
        expect(rowParis!.roles).toBe('PRESIDENT');
    });
});
