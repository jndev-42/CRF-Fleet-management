/**
 * Tests d'intégration — fonctionnalité Contrôles Techniques & Révisions.
 *
 * Couvre :
 *   - GET /api/vehicles/[id]/maintenance → 401, 200 avec pagination
 *   - POST /api/vehicles/[id]/maintenance → 401, 403, 400 (Zod), 201 happy path
 *   - DELETE /api/vehicles/[id]/maintenance/[recordId] → 401, 403, 404, 200
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/drive', () => ({
    deleteDriveFolder: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from '@/app/api/vehicles/[id]/maintenance/route';
import { DELETE } from '@/app/api/vehicles/[id]/maintenance/[recordId]/route';
import { auth } from '@/auth';
import { db, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);

function makeGetRequest(vehicleName = 'VL186', page = 1): Request {
    return new Request(`http://localhost/api/vehicles/${vehicleName}/maintenance?page=${page}`);
}

function makePostRequest(vehicleName: string, body: Record<string, unknown>): Request {
    return new Request(`http://localhost/api/vehicles/${vehicleName}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function makeDeleteRequest(vehicleName: string, recordId: string): Request {
    return new Request(`http://localhost/api/vehicles/${vehicleName}/maintenance/${recordId}`, {
        method: 'DELETE',
    });
}

const adminSession = {
    user: { id: 'user-admin', email: 'admin@test.com', roles: ['ADMIN'] },
};

const userSession = {
    user: { id: 'user-chvl', email: 'chvl@test.com', roles: ['CHVL'] },
};

// ─────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────

describe('GET /api/vehicles/[id]/maintenance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when not authenticated', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: 'VL186' }) });
        expect(res.status).toBe(401);
    });

    it('returns 404 for unknown vehicle', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(userSession);

        const res = await GET(makeGetRequest('UNKNOWN'), { params: Promise.resolve({ id: 'UNKNOWN' }) });
        expect(res.status).toBe(404);
    });

    it('returns 200 with empty records when no maintenance history', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(userSession);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: 'VL186' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.records).toEqual([]);
        expect(body.total).toBe(0);
        expect(body.page).toBe(1);
        expect(body.totalPages).toBe(1);
    });

    it('returns 200 with correct pagination', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(userSession);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        // Insert 7 records to test pagination (5 per page)
        for (let i = 1; i <= 7; i++) {
            await db.execute({
                sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage)
                      VALUES (?, ?, ?, ?, ?)`,
                args: [`rec-${i}`, 'VL001', `2024-0${Math.min(i, 9)}-01`, 'CT', null],
            });
        }

        const res = await GET(makeGetRequest('VL186', 1), { params: Promise.resolve({ id: 'VL186' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.records).toHaveLength(5);
        expect(body.total).toBe(7);
        expect(body.totalPages).toBe(2);
        expect(body.page).toBe(1);

        const res2 = await GET(makeGetRequest('VL186', 2), { params: Promise.resolve({ id: 'VL186' }) });
        const body2 = await res2.json();
        expect(body2.records).toHaveLength(2);
        expect(body2.page).toBe(2);
    });

    it('returns records with correct shape', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(userSession);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await db.execute({
            sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage)
                  VALUES (?, ?, ?, ?, ?)`,
            args: ['rec-1', 'VL001', '2024-06-15', 'REVISION', 62000],
        });

        const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: 'VL186' }) });
        const body = await res.json();
        const r = body.records[0];
        expect(r.id).toBe('rec-1');
        expect(r.date).toBe('2024-06-15');
        expect(r.type).toBe('REVISION');
        expect(r.mileage).toBe(62000);
    });
});

// ─────────────────────────────────────────────
// POST
// ─────────────────────────────────────────────

describe('POST /api/vehicles/[id]/maintenance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when not authenticated', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await POST(makePostRequest('VL186', { date: '2024-01-15', type: 'CT' }), {
            params: Promise.resolve({ id: 'VL186' }),
        });
        expect(res.status).toBe(401);
    });

    it('returns 403 when user is not ADMIN', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(userSession);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await POST(makePostRequest('VL186', { date: '2024-01-15', type: 'CT' }), {
            params: Promise.resolve({ id: 'VL186' }),
        });
        expect(res.status).toBe(403);
    });

    it('returns 400 for invalid body — missing date', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await POST(makePostRequest('VL186', { type: 'CT' }), {
            params: Promise.resolve({ id: 'VL186' }),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBeDefined();
    });

    it('returns 400 for invalid body — invalid type', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await POST(makePostRequest('VL186', { date: '2024-01-15', type: 'UNKNOWN' }), {
            params: Promise.resolve({ id: 'VL186' }),
        });
        expect(res.status).toBe(400);
    });

    it('returns 201 and creates record in DB — happy path', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await POST(
            makePostRequest('VL186', { date: '2024-06-15', type: 'CT_REVISION', mileage: 62000 }),
            { params: Promise.resolve({ id: 'VL186' }) }
        );
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.record.type).toBe('CT_REVISION');
        expect(body.record.mileage).toBe(62000);

        // Verify in DB
        const dbResult = await db.execute({
            sql: `SELECT * FROM "VehicleMaintenanceRecord" WHERE vehicleId = 'VL001'`,
            args: [],
        });
        expect(dbResult.rows).toHaveLength(1);
        expect(dbResult.rows[0].date).toBe('2024-06-15');
        expect(dbResult.rows[0].mileage).toBe(62000);
    });

    it('returns 404 for unknown vehicle', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);

        const res = await POST(
            makePostRequest('UNKNOWN', { date: '2024-06-15', type: 'CT' }),
            { params: Promise.resolve({ id: 'UNKNOWN' }) }
        );
        expect(res.status).toBe(404);
    });
});

// ─────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────

describe('DELETE /api/vehicles/[id]/maintenance/[recordId]', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when not authenticated', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await DELETE(makeDeleteRequest('VL186', 'rec-1'), {
            params: Promise.resolve({ id: 'VL186', recordId: 'rec-1' }),
        });
        expect(res.status).toBe(401);
    });

    it('returns 403 when user is not ADMIN', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(userSession);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await DELETE(makeDeleteRequest('VL186', 'rec-1'), {
            params: Promise.resolve({ id: 'VL186', recordId: 'rec-1' }),
        });
        expect(res.status).toBe(403);
    });

    it('returns 404 for unknown record', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await DELETE(makeDeleteRequest('VL186', 'nonexistent'), {
            params: Promise.resolve({ id: 'VL186', recordId: 'nonexistent' }),
        });
        expect(res.status).toBe(404);
    });

    it('returns 200 and deletes record — happy path', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await db.execute({
            sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage)
                  VALUES (?, ?, ?, ?, ?)`,
            args: ['rec-to-delete', 'VL001', '2024-06-15', 'CT', null],
        });

        const res = await DELETE(makeDeleteRequest('VL186', 'rec-to-delete'), {
            params: Promise.resolve({ id: 'VL186', recordId: 'rec-to-delete' }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        // Verify deletion in DB
        const dbResult = await db.execute({
            sql: `SELECT id FROM "VehicleMaintenanceRecord" WHERE id = 'rec-to-delete'`,
            args: [],
        });
        expect(dbResult.rows).toHaveLength(0);
    });

    it('returns 404 when record belongs to a different vehicle', async () => {
        // @ts-expect-error — partial session for test
        mockedAuth.mockResolvedValue(adminSession);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedVehicle({ id: 'VL002', name: 'VL188', type: 'VL' });
        await db.execute({
            sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage)
                  VALUES (?, ?, ?, ?, ?)`,
            args: ['rec-vl002', 'VL002', '2024-06-15', 'CT', null],
        });

        // Try to delete VL002's record via VL186's endpoint
        const res = await DELETE(makeDeleteRequest('VL186', 'rec-vl002'), {
            params: Promise.resolve({ id: 'VL186', recordId: 'rec-vl002' }),
        });
        expect(res.status).toBe(404);
    });
});
