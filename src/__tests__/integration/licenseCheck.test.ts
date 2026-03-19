/**
 * Tests d'intégration — GET /api/me/license-check et PATCH /api/users/[id]/validate-papers
 *
 * Cas couverts :
 *  GET /api/me/license-check
 *   1. 401 sans session
 *   2. Non-driver → validated: true, blocked: false
 *   3. Driver avec papiers valides → validated: true
 *   4. Driver avec papiers invalides (papiers_valides=0) et dans la période de grâce
 *   5. Driver avec papiers invalides et hors délai → blocked: true
 *   6. Driver avec last_validation expirée → déclenche invalidation
 *
 *  PATCH /api/users/[id]/validate-papers
 *   7. 401 sans session
 *   8. 403 pour rôle CHVL (non-ADMIN/RESPO)
 *   9. 404 si user inconnu
 *  10. Happy path ADMIN → papiers_valides=1
 *  11. Happy path RESPO → papiers_valides=1
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/me/license-check/route';
import { PATCH } from '@/app/api/users/[email]/validate-papers/route';
import { auth } from '@/auth';
import { db, seedUser, seedRoles, seedUserRole } from './setup';

const mockedAuth = vi.mocked(auth);

function makePatchRequest(id: string): Request {
    return new Request(`http://localhost/api/users/${encodeURIComponent(id)}/validate-papers`, {
        method: 'PATCH',
    });
}

const adminSession = { user: { id: 'admin-id', email: 'admin@test.com', name: 'Admin Test', roles: ['ADMIN'] } };
const respoSession = { user: { id: 'respo-id', email: 'respo@test.com', name: null,         roles: ['RESPO'] } };
const chvlSession  = { user: { id: 'chvl-id',  email: 'chvl@test.com',  name: null,         roles: ['CHVL'] } };

describe('GET /api/me/license-check', () => {
    it('1. 401 sans session', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('2. Non-driver → validated: true, blocked: false', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue({ user: { id: 'guest-id', email: 'guest@test.com', roles: ['GUEST'] } } as any);
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.validated).toBe(true);
        expect(body.blocked).toBe(false);
    });

    it('3. Driver avec papiers valides → validated: true', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const user = await seedUser({
            id: 'chvl-valid',
            email: 'chvl-valid@test.com',
            papiers_valides: 1,
            last_validation: today,
        });
        await seedRoles();
        await seedUserRole(user.id, 'CHVL');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue({ user: { id: user.id, email: user.email, roles: ['CHVL'] } } as any);
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.validated).toBe(true);
        expect(body.blocked).toBe(false);
    });

    it('4. Driver invalide dans la période de grâce → validated: false, blocked: false, daysLeft > 0', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const user = await seedUser({
            id: 'chvl-grace',
            email: 'chvl-grace@test.com',
            papiers_valides: 0,
            start_date_invalidation_process: today,
        });
        await seedRoles();
        await seedUserRole(user.id, 'CHVL');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue({ user: { id: user.id, email: user.email, roles: ['CHVL'] } } as any);
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.validated).toBe(false);
        expect(body.blocked).toBe(false);
        expect(body.daysLeft).toBeGreaterThan(0);
    });

    it('5. Driver invalide hors délai → blocked: true', async () => {
        // start date 20 days ago → past the 14-day grace period
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 20);
        const pastStr = pastDate.toISOString().slice(0, 10);

        const user = await seedUser({
            id: 'chvl-blocked',
            email: 'chvl-blocked@test.com',
            papiers_valides: 0,
            start_date_invalidation_process: pastStr,
        });
        await seedRoles();
        await seedUserRole(user.id, 'CHVL');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue({ user: { id: user.id, email: user.email, roles: ['CHVL'] } } as any);
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.validated).toBe(false);
        expect(body.blocked).toBe(true);
        expect(body.daysLeft).toBe(0);
    });

    it('6. Driver avec last_validation expirée → déclenche invalidation', async () => {
        // last_validation more than 6 months ago and papiers_valides still = 1
        const expiredDate = new Date();
        expiredDate.setFullYear(expiredDate.getFullYear() - 2);
        const expiredStr = expiredDate.toISOString().slice(0, 10);

        const user = await seedUser({
            id: 'chvl-expired',
            email: 'chvl-expired@test.com',
            papiers_valides: 1,
            last_validation: expiredStr,
            start_date_invalidation_process: null,
        });
        await seedRoles();
        await seedUserRole(user.id, 'CHVL');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue({ user: { id: user.id, email: user.email, roles: ['CHVL'] } } as any);
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.validated).toBe(false);
        // grace period just started today → daysLeft = 14
        expect(body.daysLeft).toBe(14);
        expect(body.blocked).toBe(false);

        // Verify DB was updated
        const dbRow = await db.execute({ sql: `SELECT papiers_valides FROM "User" WHERE id = ?`, args: [user.id] });
        expect(Number(dbRow.rows[0].papiers_valides)).toBe(0);
    });
});

describe('PATCH /api/users/[id]/validate-papers', () => {
    it('7. 401 sans session', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- null session for test
        mockedAuth.mockResolvedValue(null as any);
        const res = await PATCH(
            makePatchRequest('some-id'),
            { params: Promise.resolve({ email: 'some-id' }) }
        );
        expect(res.status).toBe(401);
    });

    it('8. 403 pour rôle CHVL', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(chvlSession as any);
        const res = await PATCH(
            makePatchRequest('some-id'),
            { params: Promise.resolve({ email: 'some-id' }) }
        );
        expect(res.status).toBe(403);
    });

    it('9. 404 si user inconnu', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);
        const res = await PATCH(
            makePatchRequest('nonexistent-id'),
            { params: Promise.resolve({ email: 'nonexistent-id' }) }
        );
        expect(res.status).toBe(404);
    });

    it('10. Happy path ADMIN → papiers_valides=1 et validated_by sauvegardé', async () => {
        const user = await seedUser({
            id: 'validate-target',
            email: 'target@test.com',
            papiers_valides: 0,
            start_date_invalidation_process: '2025-01-01',
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);
        const res = await PATCH(
            makePatchRequest(user.id),
            { params: Promise.resolve({ email: user.id }) }
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.last_validation).toBeTruthy();
        // validated_by should be the admin's name
        expect(body.validated_by).toBe('Admin Test');

        // Verify DB
        const dbRow = await db.execute({ sql: `SELECT papiers_valides, last_validation, start_date_invalidation_process, validated_by FROM "User" WHERE id = ?`, args: [user.id] });
        expect(Number(dbRow.rows[0].papiers_valides)).toBe(1);
        expect(dbRow.rows[0].last_validation).toBeTruthy();
        expect(dbRow.rows[0].start_date_invalidation_process).toBeNull();
        expect(dbRow.rows[0].validated_by).toBe('Admin Test');
    });

    it('11. Happy path RESPO → papiers_valides=1 et validated_by = email (pas de name)', async () => {
        const user = await seedUser({
            id: 'validate-target-respo',
            email: 'target-respo@test.com',
            papiers_valides: 0,
            start_date_invalidation_process: '2025-01-01',
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(respoSession as any);
        const res = await PATCH(
            makePatchRequest(user.id),
            { params: Promise.resolve({ email: user.id }) }
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        // name is null on respoSession → falls back to email
        expect(body.validated_by).toBe('respo@test.com');

        // Verify DB
        const dbRow = await db.execute({ sql: `SELECT papiers_valides, validated_by FROM "User" WHERE id = ?`, args: [user.id] });
        expect(Number(dbRow.rows[0].papiers_valides)).toBe(1);
        expect(dbRow.rows[0].validated_by).toBe('respo@test.com');
    });
});

