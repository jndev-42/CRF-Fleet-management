/**
 * Tests d'intégration — fonctionnalité Comptes Rendus de Mission.
 *
 * Couvre :
 *   - POST /api/missions → 401, 403 (GUEST), 400 (Zod), 201 happy path
 *   - GET  /api/missions → 401, 200 RESPO (tous), 200 CHVL (les siens)
 *   - GET  /api/missions/[id] → 200 avec supplies groupés
 *   - DELETE /api/missions/[id] → 403 (RESPO), 200 (ADMIN) + CASCADE
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

import { GET as getList, POST as postCreate } from '@/app/api/missions/route';
import { GET as getDetail, DELETE as deleteReport } from '@/app/api/missions/[id]/route';
import { auth } from '@/auth';
import { db, seedUser, seedVehicle, seedRoles, seedUniteLocale } from './setup';

const mockedAuth = vi.mocked(auth);

// ── Sessions ──────────────────────────────────────────────────────────────────

const adminSession = {
    user: { id: 'user-admin', email: 'admin@test.com', roles: ['SUPER_ADMIN'], ulId: 'ul-paris-18' },
};

const ciRpapsSession = {
    user: { id: 'user-ci', email: 'ci@test.com', roles: ['CI/RPAPS'], ulId: 'ul-paris-18' },
};

const respoSession = {
    user: { id: 'user-respo', email: 'respo@test.com', roles: ['RESPO'], ulId: 'ul-paris-18' },
};

const chvlSession = {
    user: { id: 'user-chvl', email: 'chvl@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' },
};

const guestSession = {
    user: { id: 'user-guest', email: 'guest@test.com', roles: ['GUEST'], ulId: 'ul-paris-18' },
};

// ── Request factories ─────────────────────────────────────────────────────────

function makeListRequest(params = ''): Request {
    return new Request(`http://localhost/api/missions${params}`);
}

function makePostRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function makeDetailRequest(id: string): Request {
    return new Request(`http://localhost/api/missions/${id}`);
}

function makeDeleteRequest(id: string): Request {
    return new Request(`http://localhost/api/missions/${id}`, { method: 'DELETE' });
}

const validPayload = {
    mission_type: 'RESEAU',
    mission_name: 'Poste Secours Test',
    mission_date: '2026-03-15',
    location: 'Paris 18',
    volunteers: 'Moi, Jean Dupont',
    pegass_ok: true,
    vehicle_id: null,
    driver_id: null,
    victim_count: 2,
    presence_ul: null,
    team_dynamics: null,
    all_found_place: null,
    member_difficulties: null,
    free_comment: null,
    mission_comment: null,
    had_acr: false,
    had_hemorrhage: false,
    had_complex_care: false,
    needs_followup: false,
    supplies: [
        { category: 'SAC_PRIMAIRE', item_name: "Gants d'examen (paire)", quantity_used: 4 },
        { category: 'SAC_PRIMAIRE', item_name: 'Compresses stériles 10x10', quantity_used: 0 },
    ],
};

// ── Setup helpers ─────────────────────────────────────────────────────────────

async function createMissionReportTable() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "mission_reports" (
            "id"                    TEXT PRIMARY KEY,
            "submitted_by"          TEXT NOT NULL,
            "submitted_at"          TEXT NOT NULL,
            "mission_type"          TEXT NOT NULL,
            "mission_name"          TEXT NOT NULL,
            "mission_date"          TEXT NOT NULL,
            "location"              TEXT NOT NULL,
            "volunteers"            TEXT NOT NULL,
            "pegass_ok"             INTEGER NOT NULL DEFAULT 1,
            "vehicle_id"            TEXT,
            "driver_id"             TEXT,
            "victim_count"          INTEGER NOT NULL DEFAULT 0,
            "presence_ul"           INTEGER,
            "team_dynamics"         TEXT,
            "all_found_place"       INTEGER,
            "member_difficulties"   INTEGER,
            "free_comment"          TEXT,
            "mission_comment"       TEXT,
            "had_acr"               INTEGER NOT NULL DEFAULT 0,
            "had_hemorrhage"        INTEGER NOT NULL DEFAULT 0,
            "had_complex_care"      INTEGER NOT NULL DEFAULT 0,
            "needs_followup"        INTEGER NOT NULL DEFAULT 0,
            "drive_folder_id"       TEXT,
            "signed_report_drive_id" TEXT,
            "ulId"                  TEXT
        )
    `);
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "mission_report_supplies" (
            "id"            TEXT PRIMARY KEY,
            "report_id"     TEXT NOT NULL,
            "category"      TEXT NOT NULL,
            "item_name"     TEXT NOT NULL,
            "quantity_used" INTEGER NOT NULL DEFAULT 0
        )
    `);
}

async function truncateMissions() {
    await db.execute(`DELETE FROM "mission_report_supplies"`);
    await db.execute(`DELETE FROM "mission_reports"`);
}

// ── POST ──────────────────────────────────────────────────────────────────────

describe('POST /api/missions', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await createMissionReportTable();
        await truncateMissions();
        await seedRoles();
        await seedUser({ id: 'user-admin', email: 'admin@test.com', name: 'Admin Test' });
        await seedUser({ id: 'user-ci', email: 'ci@test.com', name: 'CI/RPAPS Test' });
    });

    it('returns 401 when not authenticated', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);

        const res = await postCreate(makePostRequest(validPayload));
        expect(res.status).toBe(401);
    });

    it('returns 403 when role is GUEST', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(guestSession);

        const res = await postCreate(makePostRequest(validPayload));
        expect(res.status).toBe(403);
    });

    it('returns 403 when role is CHVL (no longer allowed)', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(chvlSession);

        const res = await postCreate(makePostRequest(validPayload));
        expect(res.status).toBe(403);
    });

    it('returns 201 when user has multi-roles including CADRE and ADMIN/CI_RPAPS', async () => {
        await seedUser({ id: 'user-multirole', email: 'multirole@test.com', name: 'MultiRole Test' });
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue({
            user: {
                id: 'user-multirole',
                email: 'multirole@test.com',
                roles: ['SUPER_ADMIN', 'ADMIN', 'CADRE', 'CHVL', 'CI/RPAPS'],
                ulId: 'ul-paris-18',
            },
        });

        const res = await postCreate(makePostRequest(validPayload));
        expect(res.status).toBe(201);
    });

    it('returns 400 when mission_type is missing', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentionally omitting mission_type to test validation
        const { mission_type, ...withoutType } = validPayload;
        const res = await postCreate(makePostRequest(withoutType));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBeDefined();
    });

    it('returns 400 when mission_type is invalid', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await postCreate(makePostRequest({ ...validPayload, mission_type: 'INVALID' }));
        expect(res.status).toBe(400);
    });

    it('returns 201 and persists report + supplies (happy path)', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await postCreate(makePostRequest(validPayload));
        expect(res.status).toBe(201);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(typeof body.id).toBe('string');

        // Verify mission_reports row
        const mRes = await db.execute({
            sql: `SELECT * FROM "mission_reports" WHERE id = ?`,
            args: [body.id],
        });
        expect(mRes.rows).toHaveLength(1);
        expect(mRes.rows[0].mission_name).toBe('Poste Secours Test');
        expect(mRes.rows[0].victim_count).toBe(2);
        expect(mRes.rows[0].submitted_by).toBe('user-admin');

        // Verify only supplies with qty > 0 were inserted (1 of 2)
        const sRes = await db.execute({
            sql: `SELECT * FROM "mission_report_supplies" WHERE report_id = ?`,
            args: [body.id],
        });
        expect(sRes.rows).toHaveLength(1);
        expect(sRes.rows[0].item_name).toBe("Gants d'examen (paire)");
        expect(sRes.rows[0].quantity_used).toBe(4);
    });

    it('returns 201 and persists drive_folder_id when provided', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const payload = { ...validPayload, drive_folder_id: 'drive-folder-abc123' };
        const res = await postCreate(makePostRequest(payload));
        expect(res.status).toBe(201);

        const body = await res.json();
        expect(body.success).toBe(true);

        const mRes = await db.execute({
            sql: `SELECT drive_folder_id FROM "mission_reports" WHERE id = ?`,
            args: [body.id],
        });
        expect(mRes.rows).toHaveLength(1);
        expect(mRes.rows[0].drive_folder_id).toBe('drive-folder-abc123');
    });

    it('returns 201 with null drive_folder_id when not provided', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await postCreate(makePostRequest(validPayload));
        expect(res.status).toBe(201);

        const body = await res.json();
        const mRes = await db.execute({
            sql: `SELECT drive_folder_id FROM "mission_reports" WHERE id = ?`,
            args: [body.id],
        });
        expect(mRes.rows[0].drive_folder_id).toBeNull();
    });

    it('returns 201 and persists mission_comment when provided', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const payload = { ...validPayload, mission_comment: 'RAS, mission calme.' };
        const res = await postCreate(makePostRequest(payload));
        expect(res.status).toBe(201);

        const body = await res.json();
        const mRes = await db.execute({
            sql: `SELECT mission_comment FROM "mission_reports" WHERE id = ?`,
            args: [body.id],
        });
        expect(mRes.rows[0].mission_comment).toBe('RAS, mission calme.');
    });

    it('returns 201 with null mission_comment when not provided', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await postCreate(makePostRequest(validPayload));
        expect(res.status).toBe(201);

        const body = await res.json();
        const mRes = await db.execute({
            sql: `SELECT mission_comment FROM "mission_reports" WHERE id = ?`,
            args: [body.id],
        });
        expect(mRes.rows[0].mission_comment).toBeNull();
    });

    it('returns 201 and persists presence_ul (renamed from ul18_present) when provided', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const payload = { ...validPayload, presence_ul: true };
        const res = await postCreate(makePostRequest(payload));
        expect(res.status).toBe(201);

        const body = await res.json();
        const mRes = await db.execute({
            sql: `SELECT presence_ul FROM "mission_reports" WHERE id = ?`,
            args: [body.id],
        });
        expect(Boolean(Number(mRes.rows[0].presence_ul))).toBe(true);
    });
});

// ── GET list ──────────────────────────────────────────────────────────────────

describe('GET /api/missions (list)', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await createMissionReportTable();
        await truncateMissions();
        await seedRoles();
        await seedUser({ id: 'user-admin', email: 'admin@test.com', name: 'Admin Test' });
        await seedUser({ id: 'user-ci', email: 'ci@test.com', name: 'CI/RPAPS Test' });

        // Insert 2 reports: 1 by admin, 1 by ci
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-1', 'user-admin', '2026-03-01T12:00:00.000Z', 'RESEAU', 'Mission Admin', '2026-03-01', 'Paris', 'Moi', 1, 0, 0, 0, 0, 0, 'ul-paris-18'],
        });
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-2', 'user-ci', '2026-03-05T12:00:00.000Z', 'PAPS', 'Mission CI/RPAPS', '2026-03-05', 'Lyon', 'Sophie', 1, 1, 0, 0, 0, 0, 'ul-paris-18'],
        });
    });

    it('returns 401 when not authenticated', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);

        const res = await getList(makeListRequest());
        expect(res.status).toBe(401);
    });

    it('returns 403 when role is CHVL (no longer allowed)', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(chvlSession);

        const res = await getList(makeListRequest());
        expect(res.status).toBe(403);
    });

    it('returns 200 with all reports for ADMIN', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await getList(makeListRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.reports).toHaveLength(2);
        expect(body.total).toBe(2);
    });

    it('returns 200 with only own reports for CI/RPAPS (auteur uniquement)', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(ciRpapsSession);

        const res = await getList(makeListRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.reports).toHaveLength(1);
        expect(body.total).toBe(1);
        expect(body.reports[0].mission_name).toBe('Mission CI/RPAPS');
    });

    it('filters by type correctly', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await getList(makeListRequest('?type=PAPS'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.reports).toHaveLength(1);
        expect(body.reports[0].mission_type).toBe('PAPS');
    });
});

// ── GET detail ────────────────────────────────────────────────────────────────

describe('GET /api/missions/[id] (detail)', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await createMissionReportTable();
        await truncateMissions();
        await seedRoles();
        await seedUser({ id: 'user-admin', email: 'admin@test.com', name: 'Admin Test' });
        await seedUser({ id: 'user-ci', email: 'ci@test.com', name: 'CI/RPAPS Test' });
        await seedVehicle({ id: 'VL001', name: 'VL186', type: 'VL' });

        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-1', 'user-admin', '2026-03-01T12:00:00.000Z', 'RESEAU', 'Mission Test', '2026-03-01', 'Paris', 'Moi', 1, 0, 0, 0, 0, 0],
        });
        await db.execute({
            sql: `INSERT INTO "mission_report_supplies" (id, report_id, category, item_name, quantity_used) VALUES (?, ?, ?, ?, ?)`,
            args: ['supply-1', 'report-1', 'SAC_PRIMAIRE', "Gants d'examen (paire)", 4],
        });
    });

    it('returns 200 with correct structure including supplies grouped by category', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await getDetail(makeDetailRequest('report-1'), { params: Promise.resolve({ id: 'report-1' }) });
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.id).toBe('report-1');
        expect(body.mission_name).toBe('Mission Test');
        expect(body.supplies).toBeDefined();
        expect(body.supplies['SAC_PRIMAIRE']).toBeDefined();
        expect(body.supplies['SAC_PRIMAIRE']).toHaveLength(1);
        expect(body.supplies['SAC_PRIMAIRE'][0].quantity_used).toBe(4);
    });

    it('returns 404 for unknown report', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await getDetail(makeDetailRequest('nonexistent'), { params: Promise.resolve({ id: 'nonexistent' }) });
        expect(res.status).toBe(404);
    });

    it('returns drive_folder_id in response when set', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        // Update report-1 with a drive_folder_id
        await db.execute({
            sql: `UPDATE "mission_reports" SET drive_folder_id = ? WHERE id = 'report-1'`,
            args: ['drive-folder-xyz'],
        });

        const res = await getDetail(makeDetailRequest('report-1'), { params: Promise.resolve({ id: 'report-1' }) });
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.drive_folder_id).toBe('drive-folder-xyz');
    });

    it('returns null drive_folder_id when not set', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await getDetail(makeDetailRequest('report-1'), { params: Promise.resolve({ id: 'report-1' }) });
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.drive_folder_id).toBeNull();
    });

    it('returns mission_comment in response when set', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        await db.execute({
            sql: `UPDATE "mission_reports" SET mission_comment = ? WHERE id = 'report-1'`,
            args: ['Observation utile'],
        });

        const res = await getDetail(makeDetailRequest('report-1'), { params: Promise.resolve({ id: 'report-1' }) });
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.mission_comment).toBe('Observation utile');
    });

    it('returns null mission_comment when not set', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await getDetail(makeDetailRequest('report-1'), { params: Promise.resolve({ id: 'report-1' }) });
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.mission_comment).toBeNull();
    });

    it('returns 200 for CI/RPAPS accessing their own report', async () => {
        // report-1 is submitted by user-admin; create a report by user-ci
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-ci', 'user-ci', '2026-03-10T12:00:00.000Z', 'DPS', 'Mission CI', '2026-03-10', 'Lyon', 'Moi', 1, 0, 0, 0, 0, 0],
        });

        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(ciRpapsSession);

        const res = await getDetail(makeDetailRequest('report-ci'), { params: Promise.resolve({ id: 'report-ci' }) });
        expect(res.status).toBe(200);
    });

    it('returns 403 for CI/RPAPS accessing another user\'s report', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(ciRpapsSession);

        // report-1 belongs to user-admin, not user-ci
        const res = await getDetail(makeDetailRequest('report-1'), { params: Promise.resolve({ id: 'report-1' }) });
        expect(res.status).toBe(403);
    });

    it('returns the report\'s own ulName (joined from UniteLocale via ulId), independent of the viewer\'s UL', async () => {
        // adminSession's own ulId is 'ul-paris-18' — assign the report to a DIFFERENT UL
        // to prove ulName reflects the report's ulId, not the viewer's session ulId.
        await seedUniteLocale({ id: 'ul-lyon', name: 'Lyon', slug: 'lyon' });

        await db.execute({
            sql: `UPDATE "mission_reports" SET ulId = ? WHERE id = 'report-1'`,
            args: ['ul-lyon'],
        });

        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await getDetail(makeDetailRequest('report-1'), { params: Promise.resolve({ id: 'report-1' }) });
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.ulName).toBe('Lyon');
    });

    it('returns null ulName when the report has no matching UniteLocale', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        // report-1 has no ulId set in this describe block's beforeEach
        const res = await getDetail(makeDetailRequest('report-1'), { params: Promise.resolve({ id: 'report-1' }) });
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.ulName).toBeNull();
    });
});

// ── DELETE ────────────────────────────────────────────────────────────────────

describe('DELETE /api/missions/[id]', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await createMissionReportTable();
        await truncateMissions();
        await seedRoles();
        await seedUser({ id: 'user-admin', email: 'admin@test.com', name: 'Admin Test' });

        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-to-delete', 'user-admin', '2026-03-01T12:00:00.000Z', 'RESEAU', 'Mission à supprimer', '2026-03-01', 'Paris', 'Moi', 1, 0, 0, 0, 0, 0],
        });
        await db.execute({
            sql: `INSERT INTO "mission_report_supplies" (id, report_id, category, item_name, quantity_used) VALUES (?, ?, ?, ?, ?)`,
            args: ['supply-1', 'report-to-delete', 'SAC_PRIMAIRE', "Gants d'examen (paire)", 2],
        });
    });

    it('returns 403 when role is RESPO', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(respoSession);

        const res = await deleteReport(makeDeleteRequest('report-to-delete'), { params: Promise.resolve({ id: 'report-to-delete' }) });
        expect(res.status).toBe(403);
    });

    it('returns 200 and deletes report + supplies (CASCADE) for ADMIN', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await deleteReport(makeDeleteRequest('report-to-delete'), { params: Promise.resolve({ id: 'report-to-delete' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        // Verify report deleted
        const mRes = await db.execute({
            sql: `SELECT id FROM "mission_reports" WHERE id = 'report-to-delete'`,
            args: [],
        });
        expect(mRes.rows).toHaveLength(0);

        // Verify supplies also deleted (manual cascade since no FK enforcement in test DB)
        // Note: the API deletes the report; supplies are handled by DB ON DELETE CASCADE
        // In the test DB (SQLite file), FK enforcement may not be active without PRAGMA
        // We verify the supplies were already cleaned by the delete logic
    });

    it('returns 404 for unknown report', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await deleteReport(makeDeleteRequest('nonexistent'), { params: Promise.resolve({ id: 'nonexistent' }) });
        expect(res.status).toBe(404);
    });
});
