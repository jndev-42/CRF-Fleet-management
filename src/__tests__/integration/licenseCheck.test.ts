/**
 * Tests d'intégration — GET /api/me/license-check et PATCH /api/users/[id]/validate-papers
 *
 * Cas couverts :
 *  GET /api/me/license-check
 *   1. 401 sans session
 *   2. Non-chauffeur : contrôlé comme un chauffeur (bloqué hors délai, valide sinon)
 *   3. Driver avec papiers valides → validated: true
 *   4. Driver avec papiers invalides (papiers_valides=0) et dans la période de grâce
 *   5. Driver avec papiers invalides et hors délai → blocked: true
 *   6. Driver avec last_validation expirée → déclenche invalidation
 *
 *  PATCH /api/users/[id]/validate-papers
 *   7. 401 sans session
 *   8. 403 pour rôle CHVL (non-ADMIN/CADRE)
 *   9. 404 si user inconnu
 *  10. Happy path ADMIN → papiers_valides=1
 *  11. Happy path CADRE → papiers_valides=1
 *  12. Cloisonnement UL (membre secondaire, autre UL, compte sans UL, session sans UL, super admin)
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
import { db, seedUser, seedRoles, seedUserRole, seedUserUL, seedUniteLocale } from './setup';

const mockedAuth = vi.mocked(auth);

function makePatchRequest(id: string): Request {
    return new Request(`http://localhost/api/users/${encodeURIComponent(id)}/validate-papers`, {
        method: 'PATCH',
    });
}

const adminSession = { user: { id: 'admin-id', email: 'admin@test.com', name: 'Admin Test', roles: ['SUPER_ADMIN'] } };
const respoSession = { user: { id: 'respo-id', email: 'respo@test.com', name: null,         roles: ['CADRE'], ulId: 'ul-paris-18' } };
const chvlSession  = { user: { id: 'chvl-id',  email: 'chvl@test.com',  name: null,         roles: ['CHVL'] } };

describe('GET /api/me/license-check', () => {
    it('1. 401 sans session', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('2. Non-chauffeur (ADMIN) aux papiers hors délai → blocked: true (plus de dispense)', async () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 20);
        const user = await seedUser({
            id: 'admin-blocked',
            email: 'admin-blocked@test.com',
            papiers_valides: 0,
            start_date_invalidation_process: pastDate.toISOString().slice(0, 10),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue({ user: { id: user.id, email: user.email, roles: ['ADMIN'] } } as any);
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.validated).toBe(false);
        expect(body.blocked).toBe(true);
    });

    it('2b. Non-chauffeur aux papiers valides → validated: true, blocked: false', async () => {
        const user = await seedUser({
            id: 'guest-valid',
            email: 'guest-valid@test.com',
            papiers_valides: 1,
            last_validation: new Date().toISOString().slice(0, 10),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue({ user: { id: user.id, email: user.email, roles: ['GUEST'] } } as any);
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
    it('7b. 403 quand un administrateur valide ses propres papiers, rien n\'est écrit', async () => {
        await seedUser({ id: 'admin-id', email: 'admin@test.com', papiers_valides: 0, start_date_invalidation_process: '2025-01-01' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);
        const res = await PATCH(makePatchRequest('admin-id'), { params: Promise.resolve({ email: 'admin-id' }) });
        expect(res.status).toBe(403);
        const row = (await db.execute({ sql: `SELECT papiers_valides FROM "User" WHERE id = ?`, args: ['admin-id'] })).rows[0];
        expect(Number(row.papiers_valides)).toBe(0);
    });

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

    it('11. Happy path CADRE → papiers_valides=1 et validated_by = email (pas de name)', async () => {
        const user = await seedUser({
            id: 'validate-target-respo',
            email: 'target-respo@test.com',
            papiers_valides: 0,
            start_date_invalidation_process: '2025-01-01',
        });

        await seedUniteLocale();
        await seedUserUL({ userId: user.id, ulId: 'ul-paris-18', isHome: true });

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

    describe('12. Cloisonnement UL', () => {
        const OUTSIDE_UL_MESSAGE = "Ce membre n'appartient pas à votre unité locale";

        async function seedTwoUls() {
            await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
            await seedUniteLocale({ id: 'ul-lyon', name: 'Lyon', slug: 'lyon' });
        }

        async function patchAs(session: unknown, userId: string) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
            mockedAuth.mockResolvedValue(session as any);
            return PATCH(makePatchRequest(userId), { params: Promise.resolve({ email: userId }) });
        }

        async function papiersValides(userId: string): Promise<number> {
            const row = (await db.execute({ sql: `SELECT papiers_valides FROM "User" WHERE id = ?`, args: [userId] })).rows[0];
            return Number(row.papiers_valides);
        }

        it('12a. Membre secondaire de l\'UL active (rattaché ailleurs) → 200', async () => {
            await seedTwoUls();
            const user = await seedUser({ id: 'ul-secondary', email: 'ul-secondary@test.com', papiers_valides: 0 });
            await seedUserUL({ userId: user.id, ulId: 'ul-lyon', isHome: true });
            await seedUserUL({ userId: user.id, ulId: 'ul-paris-18', isHome: false });

            const res = await patchAs(respoSession, user.id);
            expect(res.status).toBe(200);
            expect(await papiersValides(user.id)).toBe(1);
        });

        it('12b. Membre d\'une autre UL seulement → 404, rien n\'est écrit', async () => {
            await seedTwoUls();
            const user = await seedUser({ id: 'ul-other', email: 'ul-other@test.com', papiers_valides: 0 });
            await seedUserUL({ userId: user.id, ulId: 'ul-lyon', isHome: true });

            const res = await patchAs(respoSession, user.id);
            expect(res.status).toBe(404);
            expect((await res.json()).error).toBe(OUTSIDE_UL_MESSAGE);
            expect(await papiersValides(user.id)).toBe(0);
            const row = (await db.execute({ sql: `SELECT validated_by, last_validation FROM "User" WHERE id = ?`, args: [user.id] })).rows[0];
            expect(row.validated_by).toBeNull();
            expect(row.last_validation).toBeNull();
        });

        it('12c. Compte sans aucune UL → 200, comme avant', async () => {
            const user = await seedUser({ id: 'ul-none', email: 'ul-none@test.com', papiers_valides: 0 });

            const res = await patchAs(respoSession, user.id);
            expect(res.status).toBe(200);
            expect(await papiersValides(user.id)).toBe(1);
        });

        it('12d. Session sur l\'UL \'default\', cible membre d\'une UL → 404, rien n\'est écrit', async () => {
            await seedTwoUls();
            const user = await seedUser({ id: 'ul-default-target', email: 'ul-default-target@test.com', papiers_valides: 0 });
            await seedUserUL({ userId: user.id, ulId: 'ul-paris-18', isHome: true });

            const res = await patchAs({ user: { ...respoSession.user, ulId: 'default' } }, user.id);
            expect(res.status).toBe(404);
            expect((await res.json()).error).toBe(OUTSIDE_UL_MESSAGE);
            expect(await papiersValides(user.id)).toBe(0);
        });

        it('12e. Session sans ulId, cible membre d\'une UL → 404', async () => {
            await seedTwoUls();
            const user = await seedUser({ id: 'ul-noid-target', email: 'ul-noid-target@test.com', papiers_valides: 0 });
            await seedUserUL({ userId: user.id, ulId: 'ul-paris-18', isHome: true });

            const res = await patchAs({ user: { ...respoSession.user, ulId: undefined } }, user.id);
            expect(res.status).toBe(404);
            expect((await res.json()).error).toBe(OUTSIDE_UL_MESSAGE);
            expect(await papiersValides(user.id)).toBe(0);
        });

        it('12f. Session sur l\'UL \'default\', cible sans UL → 200', async () => {
            const user = await seedUser({ id: 'ul-default-none', email: 'ul-default-none@test.com', papiers_valides: 0 });

            const res = await patchAs({ user: { ...respoSession.user, ulId: 'default' } }, user.id);
            expect(res.status).toBe(200);
            expect(await papiersValides(user.id)).toBe(1);
        });

        it('12g. SUPER_ADMIN valide un membre d\'une autre UL → 200', async () => {
            await seedTwoUls();
            const user = await seedUser({ id: 'ul-sa-target', email: 'ul-sa-target@test.com', papiers_valides: 0 });
            await seedUserUL({ userId: user.id, ulId: 'ul-lyon', isHome: true });

            const res = await patchAs({ user: { ...adminSession.user, ulId: 'ul-paris-18' } }, user.id);
            expect(res.status).toBe(200);
            expect(await papiersValides(user.id)).toBe(1);
        });

        it.each([
            ['12b2. ADMIN', 'ADMIN'],
            ['12b3. PRESIDENT', 'PRESIDENT'],
        ])('%s de ul-paris-18, cible membre de ul-lyon seulement → 404, rien n\'est écrit', async (_label, role) => {
            await seedTwoUls();
            const user = await seedUser({ id: `ul-lyon-${role}`, email: `ul-lyon-${role}@test.com`, papiers_valides: 0 });
            await seedUserUL({ userId: user.id, ulId: 'ul-lyon', isHome: true });

            const res = await patchAs({ user: { id: `${role}-id`, email: `${role}@test.com`, name: role, roles: [role], ulId: 'ul-paris-18' } }, user.id);
            expect(res.status).toBe(404);
            expect((await res.json()).error).toBe(OUTSIDE_UL_MESSAGE);
            const row = (await db.execute({ sql: `SELECT papiers_valides, validated_by, last_validation FROM "User" WHERE id = ?`, args: [user.id] })).rows[0];
            expect(Number(row.papiers_valides)).toBe(0);
            expect(row.validated_by).toBeNull();
            expect(row.last_validation).toBeNull();
        });

        it('12i. Auto-validation par un acteur d\'une autre UL → 403 (pas 404), rien n\'est écrit', async () => {
            await seedTwoUls();
            const self = await seedUser({ id: 'ul-self-other', email: 'ul-self-other@test.com', papiers_valides: 0 });
            await seedUserUL({ userId: self.id, ulId: 'ul-lyon', isHome: true });

            const res = await patchAs({ user: { id: self.id, email: self.email, name: null, roles: ['ADMIN'], ulId: 'ul-paris-18' } }, self.id);
            expect(res.status).toBe(403);
            expect(await papiersValides(self.id)).toBe(0);
        });

        it('12h. ADMIN membre de son UL active valide ses propres papiers → 403', async () => {
            await seedTwoUls();
            const self = await seedUser({ id: 'ul-self', email: 'ul-self@test.com', papiers_valides: 0 });
            await seedUserUL({ userId: self.id, ulId: 'ul-paris-18', isHome: true });

            const res = await patchAs({ user: { id: self.id, email: self.email, name: null, roles: ['ADMIN'], ulId: 'ul-paris-18' } }, self.id);
            expect(res.status).toBe(403);
            expect(await papiersValides(self.id)).toBe(0);
        });
    });
});
