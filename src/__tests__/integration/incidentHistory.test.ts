import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/vehicles/[id]/incidents/route';
import { db } from '@/lib/db';
import { auth } from '@/auth';

// Mock DB and auth
vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

describe('GET /api/vehicles/[id]/incidents', () => {
    const testVehicleName = 'INCIDENT_TEST_V';
    const testVehicleId = 'v-inc-1';
    const testUserId = 'u-inc-1';

    beforeEach(async () => {
        vi.clearAllMocks();

        // Ensure clean state
        await db.execute({ sql: `DELETE FROM IncidentReport WHERE vehicleId = ?`, args: [testVehicleId] });
        await db.execute({ sql: `DELETE FROM Vehicle WHERE id = ?`, args: [testVehicleId] });
        await db.execute({ sql: `DELETE FROM "User" WHERE id = ?`, args: [testUserId] });

        // Insert test user
        await db.execute({
            sql: `INSERT INTO "User" (id, email, name) VALUES (?, ?, ?)`,
            args: [testUserId, 'testinc@dev.local', 'Test Inc User']
        });

        // Insert test vehicle
        await db.execute({
            sql: `INSERT INTO Vehicle (id, name, type, plate, updatedAt) VALUES (?, ?, ?, ?, ?)`,
            args: [testVehicleId, testVehicleName, 'VL', 'INC-123-AB', new Date().toISOString()]
        });
    });

    afterEach(async () => {
        await db.execute({ sql: `DELETE FROM IncidentReport WHERE vehicleId = ?`, args: [testVehicleId] });
        await db.execute({ sql: `DELETE FROM Vehicle WHERE id = ?`, args: [testVehicleId] });
        await db.execute({ sql: `DELETE FROM "User" WHERE id = ?`, args: [testUserId] });
    });

    it('returns 401 if unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);

        const req = new Request(`http://localhost/api/vehicles/${testVehicleName}/incidents`);
        const res = await GET(req, { params: Promise.resolve({ id: testVehicleName }) });

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Non authentifié');
    });

    it('returns only user incidents if authenticated but not ADMIN', async () => {
        const currentUserId = testUserId; // Use the already inserted test user
        vi.mocked(auth).mockResolvedValueOnce({
            user: { id: currentUserId, email: 'testinc@dev.local', roles: ['CHVL'] },
            expires: '9999',
        } as never);

        // We need another valid user for the "other" incident to test filtering
        const otherUserId = 'other-user-id-' + Math.random().toString(36).substring(7);
        await db.execute({
            sql: `INSERT INTO "User" (id, email, name) VALUES (?, ?, ?)`,
            args: [otherUserId, `other-${Math.random().toString(36).substring(7)}@dev.local`, 'Other User']
        });

        // Insert two incidents: one for this user, one for another
        const myIncident = 'inc-mine';
        const otherIncident = 'inc-other';

        await db.execute({
            sql: `INSERT INTO IncidentReport (id, vehicleId, userId, type, status, occurredAt) 
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [myIncident, testVehicleId, currentUserId, 'FLASH', 'DRAFT', '2023-01-01T10:00']
        });

        await db.execute({
            sql: `INSERT INTO IncidentReport (id, vehicleId, userId, type, status, occurredAt) 
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [otherIncident, testVehicleId, otherUserId, 'ACCIDENT', 'SUBMITTED', '2023-01-02T10:00']
        });

        const req = new Request(`http://localhost/api/vehicles/${testVehicleName}/incidents`);
        const res = await GET(req, { params: Promise.resolve({ id: testVehicleName }) });

        expect(res.status).toBe(200);
        const data = await res.json();
        
        expect(data.incidents).toHaveLength(1);
        expect(data.incidents[0].id).toBe(myIncident);
    });

    it('returns 404 if vehicle does not exist', async () => {
        vi.mocked(auth).mockResolvedValueOnce({
            user: { id: 'admin-id', email: 'admin@dev.local', roles: ['ADMIN'] },
            expires: '9999',
        } as never);

        const req = new Request(`http://localhost/api/vehicles/UNKNOWN_VEHICLE/incidents`);
        const res = await GET(req, { params: Promise.resolve({ id: 'UNKNOWN_VEHICLE' }) });

        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.error).toBe('Véhicule non trouvé');
    });

    it('returns incidents for ADMIN on success path', async () => {
        vi.mocked(auth).mockResolvedValueOnce({
            user: { email: 'admin@dev.local', roles: ['ADMIN'] },
            expires: '9999',
        } as never);

        const incidentId1 = 'inc-1';
        const incidentId2 = 'inc-2';

        // Insert incidents
        await db.execute({
            sql: `INSERT INTO IncidentReport (id, vehicleId, userId, type, status, occurredAt) 
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [incidentId1, testVehicleId, testUserId, 'FLASH', 'SUBMITTED', '2023-01-01T10:00']
        });

        await db.execute({
            sql: `INSERT INTO IncidentReport (id, vehicleId, userId, type, status, occurredAt) 
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [incidentId2, testVehicleId, testUserId, 'ACCIDENT', 'DRAFT', '2023-01-02T10:00']
        });

        const req = new Request(`http://localhost/api/vehicles/${testVehicleName}/incidents`);
        const res = await GET(req, { params: Promise.resolve({ id: testVehicleName }) });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.incidents).toHaveLength(2);
        
        // Results are ordered by createdAt DESC by default, let's just check contents
        const ids = data.incidents.map((i: { id: string }) => i.id);
        expect(ids).toContain(incidentId1);
        expect(ids).toContain(incidentId2);

        const inc1 = data.incidents.find((i: { id: string; type: string; status: string; userName: string }) => i.id === incidentId1);
        expect(inc1.type).toBe('FLASH');
        expect(inc1.status).toBe('SUBMITTED');
        expect(inc1.userName).toBe('Test Inc User');
    });
});
