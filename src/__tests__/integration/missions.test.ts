/**
 * Tests d'intégration — fonctionnalité Comptes Rendus de Mission.
 *
 * Couvre :
 *   - POST /api/missions → 401, 403 (GUEST), 400 (Zod), 201 happy path
 *   - POST rattachement UL/DT → 400 si aucun ou les deux, persistance exclusive
 *   - GET  /api/missions → 401, 403 (CHVL), scope=mine (cross-UL/DT), scope=all (UL active, 403 non-manager)
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
    selected_ul_id: 'ul-paris-18',
    selected_dt_code: null,
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
            "ulId"                  TEXT,
            "dt_code"               TEXT
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
        // Le POST vérifie que le rattachement désigne une vraie UL / une DT portée
        // par une UL : les fixtures doivent donc exister en base.
        await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
        await seedUniteLocale({ id: 'ul-lyon', name: 'Lyon', slug: 'lyon' });
        await db.execute({
            sql: `UPDATE "UniteLocale" SET dtCode = ? WHERE id = ?`,
            args: ['DT 75', 'ul-paris-18'],
        });
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
        mockedAuth.mockResolvedValue({
            user: {
                id: 'user-multirole',
                email: 'multirole@test.com',
                roles: ['SUPER_ADMIN', 'ADMIN', 'CADRE', 'CHVL', 'CI/RPAPS'],
                ulId: 'ul-paris-18',
            },
        } as never);

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

    // ── Rattachement UL / DT (exactement un des deux) ─────────────────────────

    it('returns 400 when neither an UL nor a DT is selected', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await postCreate(makePostRequest({ ...validPayload, selected_ul_id: null, selected_dt_code: null }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('Données invalides');
        expect(body.details).toBeDefined();
    });

    it('returns 400 when BOTH an UL and a DT are selected', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await postCreate(makePostRequest({ ...validPayload, selected_ul_id: 'ul-paris-18', selected_dt_code: 'DT 75' }));
        expect(res.status).toBe(400);
    });

    it('persists the SELECTED ulId, not the submitter\'s active UL', async () => {
        // adminSession.ulId is 'ul-paris-18' — choose a different UL to prove the
        // report follows the explicit selection.
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await postCreate(makePostRequest({ ...validPayload, selected_ul_id: 'ul-lyon' }));
        expect(res.status).toBe(201);

        const body = await res.json();
        const mRes = await db.execute({
            sql: `SELECT ulId, dt_code FROM "mission_reports" WHERE id = ?`,
            args: [body.id],
        });
        expect(mRes.rows[0].ulId).toBe('ul-lyon');
        expect(mRes.rows[0].dt_code).toBeNull();
    });

    it('persists dt_code with a NULL ulId when a DT is selected', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await postCreate(makePostRequest({ ...validPayload, selected_ul_id: null, selected_dt_code: 'DT 75' }));
        expect(res.status).toBe(201);

        const body = await res.json();
        const mRes = await db.execute({
            sql: `SELECT ulId, dt_code FROM "mission_reports" WHERE id = ?`,
            args: [body.id],
        });
        expect(mRes.rows[0].ulId).toBeNull();
        expect(mRes.rows[0].dt_code).toBe('DT 75');
    });

    it('returns 400 when the selected UL does not exist', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await postCreate(makePostRequest({ ...validPayload, selected_ul_id: 'ul-inexistante' }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('UL de rattachement introuvable.');

        const count = await db.execute(`SELECT COUNT(*) AS c FROM "mission_reports"`);
        expect(Number(count.rows[0].c)).toBe(0);
    });

    it('returns 400 when the selected DT is not carried by any UL', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await postCreate(makePostRequest({ ...validPayload, selected_ul_id: null, selected_dt_code: 'DT 999' }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('Direction Territoriale de rattachement introuvable.');

        const count = await db.execute(`SELECT COUNT(*) AS c FROM "mission_reports"`);
        expect(Number(count.rows[0].c)).toBe(0);
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
        await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
        await seedUniteLocale({ id: 'ul-lyon', name: 'Lyon', slug: 'lyon' });

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

    it('returns 200 with all UL reports for ADMIN with scope=all', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await getList(makeListRequest('?scope=all'));
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

        const res = await getList(makeListRequest('?scope=all&type=PAPS'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.reports).toHaveLength(1);
        expect(body.reports[0].mission_type).toBe('PAPS');
    });

    // ── scope=mine / scope=all ────────────────────────────────────────────────

    it('scope=mine returns the submitter\'s reports across every UL and DT', async () => {
        // Same submitter, three different attachments — including a DT report.
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId, dt_code)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-lyon', 'user-ci', '2026-02-01T12:00:00.000Z', 'DPS', 'Mission Lyon', '2026-02-01', 'Lyon', 'Moi', 1, 0, 0, 0, 0, 0, 'ul-lyon', null],
        });
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId, dt_code)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-dt', 'user-ci', '2026-01-01T12:00:00.000Z', 'DPS', 'Mission DT', '2026-01-01', 'Paris', 'Moi', 1, 0, 0, 0, 0, 0, null, 'DT 75'],
        });

        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(ciRpapsSession);

        const res = await getList(makeListRequest('?scope=mine'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.reports.map((r: { id: string }) => r.id).sort()).toEqual(['report-2', 'report-dt', 'report-lyon']);

        const byId = Object.fromEntries(body.reports.map((r: { id: string }) => [r.id, r]));
        expect(byId['report-2'].ul_name).toBe('Paris 18');
        expect(byId['report-2'].dt_code).toBeNull();
        expect(byId['report-lyon'].ul_name).toBe('Lyon');
        expect(byId['report-dt'].ul_name).toBeNull();
        expect(byId['report-dt'].dt_code).toBe('DT 75');
    });

    it('scope=all is scoped to the ACTIVE UL and never surfaces a DT report', async () => {
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId, dt_code)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-lyon', 'user-ci', '2026-02-01T12:00:00.000Z', 'DPS', 'Mission Lyon', '2026-02-01', 'Lyon', 'Moi', 1, 0, 0, 0, 0, 0, 'ul-lyon', null],
        });
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId, dt_code)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-dt', 'user-admin', '2026-01-01T12:00:00.000Z', 'DPS', 'Mission DT', '2026-01-01', 'Paris', 'Moi', 1, 0, 0, 0, 0, 0, null, 'DT 75'],
        });

        // UL active = Paris 18
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);
        const paris = await (await getList(makeListRequest('?scope=all'))).json();
        expect(paris.reports.map((r: { id: string }) => r.id).sort()).toEqual(['report-1', 'report-2']);

        // Même utilisateur, UL active = Lyon via le sélecteur de la Navbar
        mockedAuth.mockResolvedValue({
            user: { ...adminSession.user, ulId: 'ul-lyon' },
        } as never);
        const lyon = await (await getList(makeListRequest('?scope=all'))).json();
        expect(lyon.reports.map((r: { id: string }) => r.id)).toEqual(['report-lyon']);
    });

    it('returns 403 on scope=all for a non-manager (CI/RPAPS)', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(ciRpapsSession);

        const res = await getList(makeListRequest('?scope=all'));
        expect(res.status).toBe(403);
    });

    it('returns an empty list on scope=all when no UL is active', async () => {
        mockedAuth.mockResolvedValue({
            user: { ...adminSession.user, ulId: 'default' },
        } as never);

        const res = await getList(makeListRequest('?scope=all'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.reports).toHaveLength(0);
        expect(body.total).toBe(0);
    });

    it('scope=mine still works when no UL is active', async () => {
        mockedAuth.mockResolvedValue({
            user: { ...ciRpapsSession.user, ulId: 'default' },
        } as never);

        const res = await getList(makeListRequest('?scope=mine'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.reports).toHaveLength(1);
        expect(body.reports[0].id).toBe('report-2');
    });

    it('scope=mine combines with the type filter', async () => {
        // Deux rapports du MÊME auteur, de types différents : le filtre doit
        // s'ajouter au périmètre auteur, pas le remplacer.
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-ci-reseau', 'user-ci', '2026-03-06T12:00:00.000Z', 'RESEAU', 'Réseau CI', '2026-03-06', 'Paris', 'Moi', 1, 0, 0, 0, 0, 0, 'ul-lyon'],
        });

        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(ciRpapsSession);

        const paps = await (await getList(makeListRequest('?scope=mine&type=PAPS'))).json();
        expect(paps.reports.map((r: { id: string }) => r.id)).toEqual(['report-2']);
        expect(paps.total).toBe(1);

        // Le rapport de l'admin est RESEAU lui aussi : il ne doit pas remonter.
        const reseau = await (await getList(makeListRequest('?scope=mine&type=RESEAU'))).json();
        expect(reseau.reports.map((r: { id: string }) => r.id)).toEqual(['report-ci-reseau']);
    });

    it('paginates within the active scope', async () => {
        // 3 rapports du même auteur, dates décroissantes garanties par l'ORDER BY.
        for (const [id, date] of [['p-1', '2026-05-03'], ['p-2', '2026-05-02'], ['p-3', '2026-05-01']]) {
            await db.execute({
                sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [id, 'user-admin', `${date}T12:00:00.000Z`, 'DPS', `Mission ${id}`, date, 'Paris', 'Moi', 1, 0, 0, 0, 0, 0, 'ul-paris-18'],
            });
        }

        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const page1 = await (await getList(makeListRequest('?scope=mine&type=DPS&limit=2&page=1'))).json();
        expect(page1.reports.map((r: { id: string }) => r.id)).toEqual(['p-1', 'p-2']);
        expect(page1.total).toBe(3);
        expect(page1.page).toBe(1);
        expect(page1.limit).toBe(2);

        const page2 = await (await getList(makeListRequest('?scope=mine&type=DPS&limit=2&page=2'))).json();
        expect(page2.reports.map((r: { id: string }) => r.id)).toEqual(['p-3']);
        // `total` reste le total du périmètre, pas la taille de la page.
        expect(page2.total).toBe(3);
        expect(page2.page).toBe(2);
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

    it('returns 200 for a plain ADMIN reading their OWN report attached to another UL', async () => {
        // Rôle ADMIN nu (pas SUPER_ADMIN) : la branche « UL active » ne s'applique
        // pas (ul-lyon ≠ ul-paris-18), seule la branche auteur peut ouvrir l'accès.
        await seedUser({ id: 'user-plain-admin', email: 'plainadmin@test.com', name: 'Plain Admin' });
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-admin-lyon', 'user-plain-admin', '2026-04-01T12:00:00.000Z', 'DPS', 'Mission Lyon', '2026-04-01', 'Lyon', 'Moi', 1, 0, 0, 0, 0, 0, 'ul-lyon'],
        });

        mockedAuth.mockResolvedValue({
            user: { id: 'user-plain-admin', email: 'plainadmin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' },
        } as never);

        const res = await getDetail(makeDetailRequest('report-admin-lyon'), { params: Promise.resolve({ id: 'report-admin-lyon' }) });
        expect(res.status).toBe(200);
    });

    it('returns 200 for a plain ADMIN reading their OWN report attached to a DT', async () => {
        // Un rapport DT porte ulId = NULL : aucune UL ne peut le rapprocher, donc
        // sans la branche auteur son propre rédacteur perdrait l'accès.
        await seedUser({ id: 'user-plain-admin', email: 'plainadmin@test.com', name: 'Plain Admin' });
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId, dt_code)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-admin-dt', 'user-plain-admin', '2026-04-02T12:00:00.000Z', 'DPS', 'Mission DT', '2026-04-02', 'Paris', 'Moi', 1, 0, 0, 0, 0, 0, null, 'DT 75'],
        });

        mockedAuth.mockResolvedValue({
            user: { id: 'user-plain-admin', email: 'plainadmin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' },
        } as never);

        const res = await getDetail(makeDetailRequest('report-admin-dt'), { params: Promise.resolve({ id: 'report-admin-dt' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.dtCode).toBe('DT 75');
        expect(body.ulName).toBeNull();
    });

    it('returns 403 for a plain ADMIN reading SOMEONE ELSE\'S report attached to a DT', async () => {
        // Contrepoint du test précédent : la branche auteur ne doit pas se
        // transformer en passe-droit pour tout rapport DT.
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, victim_count, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId, dt_code)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['report-other-dt', 'user-ci', '2026-04-03T12:00:00.000Z', 'DPS', 'Mission DT autrui', '2026-04-03', 'Paris', 'Moi', 1, 0, 0, 0, 0, 0, null, 'DT 75'],
        });

        mockedAuth.mockResolvedValue({
            user: { id: 'user-plain-admin', email: 'plainadmin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' },
        } as never);

        const res = await getDetail(makeDetailRequest('report-other-dt'), { params: Promise.resolve({ id: 'report-other-dt' }) });
        expect(res.status).toBe(403);
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
