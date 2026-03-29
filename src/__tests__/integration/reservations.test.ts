/**
 * Tests d'intégration — POST /api/vehicles/[id]/reservations
 *
 * Stratégie : appel direct du handler Next.js avec un vrai SQLite.
 * - Auth mockée (pas de vraie session)
 * - OneSignal mocké (notifications push)
 *
 * Cas couverts :
 *  1. 401 sans session
 *  2. 403 — CHVL utilise onBehalfOfUserId
 *  3. 403 — RESPO utilise onBehalfOfUserId
 *  4. 400 — endTime avant startTime
 *  5. 404 — ADMIN fournit un userId inconnu
 *  6. 201 — CHVL réserve pour lui-même → status PENDING, userEmail = CHVL
 *  7. 201 — ADMIN réserve pour lui-même → status VALIDATED
 *  8. 201 — ADMIN réserve pour un autre → status VALIDATED, userEmail = cible
 *  9. 409 — conflit avec une réservation VALIDATED existante
 * 10. cross-vehicle : même utilisateur peut réserver VL002 en overlap avec VL001 → 201
 * 11. 409 — CHVL chevauche une réservation PENDING existante
 * 12. 409 — ADMIN bloqué par un overlap PENDING (pas de bypass)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/onesignal', () => ({ sendPushNotification: vi.fn().mockResolvedValue(undefined) }));

import { POST } from '@/app/api/vehicles/[id]/reservations/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

function makeRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/vehicles/VL001/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

/** Returns ISO strings for a future time window starting N hours from now */
function futureWindow(startOffsetHours = 1, durationHours = 2): { startTime: string; endTime: string } {
    const start = new Date(Date.now() + startOffsetHours * 60 * 60 * 1000);
    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
}

const VEHICLE_ID = 'VL001';

beforeEach(async () => {
    // Seed a vehicle and test users before each test
    await seedVehicle({ id: VEHICLE_ID, name: 'VL186' });
    await seedUser({ id: 'user-chvl', email: 'chvl@dev.local', name: 'Chauffeur Test' });
    await seedUser({ id: 'user-respo', email: 'respo@dev.local', name: 'Respo Test' });
    await seedUser({ id: 'user-admin', email: 'admin@dev.local', name: 'Admin Test' });
    await seedUser({ id: 'user-target', email: 'target@dev.local', name: 'Utilisateur Cible' });
});

describe('POST /api/vehicles/[id]/reservations — authentification', () => {
    it('1. retourne 401 sans session', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        const { startTime, endTime } = futureWindow();
        const res = await POST(makeRequest({ startTime, endTime }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(401);
    });
});

describe('POST /api/vehicles/[id]/reservations — autorisation onBehalfOf', () => {
    it('2. retourne 403 si CHVL utilise onBehalfOfUserId', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'] } } as never);
        const { startTime, endTime } = futureWindow();
        const res = await POST(makeRequest({ startTime, endTime, onBehalfOfUserId: 'user-target' }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toContain('ADMIN');
    });

    it('3. retourne 403 si RESPO utilise onBehalfOfUserId', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'respo@dev.local', name: 'Respo Test', roles: ['RESPO'] } } as never);
        const { startTime, endTime } = futureWindow();
        const res = await POST(makeRequest({ startTime, endTime, onBehalfOfUserId: 'user-target' }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(403);
    });
});

describe('POST /api/vehicles/[id]/reservations — validation Zod', () => {
    it('4. retourne 400 si endTime est avant startTime', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'] } } as never);
        const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const end = new Date(Date.now() + 1 * 60 * 60 * 1000);
        const res = await POST(makeRequest({ startTime: start.toISOString(), endTime: end.toISOString() }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('Données invalides');
    });
});

describe('POST /api/vehicles/[id]/reservations — onBehalfOf 404', () => {
    it('5. retourne 404 si ADMIN fournit un userId inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', name: 'Admin Test', roles: ['ADMIN'] } } as never);
        const { startTime, endTime } = futureWindow();
        const res = await POST(makeRequest({ startTime, endTime, onBehalfOfUserId: 'user-unknown-xyz' }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toContain('introuvable');
    });
});

describe('POST /api/vehicles/[id]/reservations — happy paths', () => {
    it('6. CHVL réservant pour lui-même → 201, status PENDING, userEmail = CHVL', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'] } } as never);
        const { startTime, endTime } = futureWindow(2, 2);
        const res = await POST(makeRequest({ startTime, endTime, reason: 'Maraude test' }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.status).toBe('PENDING');

        const rows = await db.execute({ sql: `SELECT * FROM "Reservation" WHERE id = ?`, args: [body.id] });
        expect(rows.rows.length).toBe(1);
        expect(rows.rows[0].userEmail).toBe('chvl@dev.local');
        expect(rows.rows[0].status).toBe('PENDING');
    });

    it('7. ADMIN réservant pour lui-même → 201, status VALIDATED', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', name: 'Admin Test', roles: ['ADMIN'] } } as never);
        const { startTime, endTime } = futureWindow(4, 2);
        const res = await POST(makeRequest({ startTime, endTime }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.status).toBe('VALIDATED');

        const rows = await db.execute({ sql: `SELECT * FROM "Reservation" WHERE id = ?`, args: [body.id] });
        expect(rows.rows[0].userEmail).toBe('admin@dev.local');
        expect(rows.rows[0].status).toBe('VALIDATED');
    });

    it('8. ADMIN réservant pour un autre → 201, status VALIDATED, userEmail = cible', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', name: 'Admin Test', roles: ['ADMIN'] } } as never);
        const { startTime, endTime } = futureWindow(7, 2);
        const res = await POST(makeRequest({ startTime, endTime, onBehalfOfUserId: 'user-target' }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.status).toBe('VALIDATED');

        // La réservation doit être au nom de la cible
        const rows = await db.execute({ sql: `SELECT * FROM "Reservation" WHERE id = ?`, args: [body.id] });
        expect(rows.rows[0].userEmail).toBe('target@dev.local');
        expect(rows.rows[0].userName).toBe('Utilisateur Cible');
        expect(rows.rows[0].status).toBe('VALIDATED');
    });
});

describe('POST /api/vehicles/[id]/reservations — conflits', () => {
    it('9. retourne 409 si le créneau chevauche une réservation VALIDATED existante', async () => {
        // Seed a validated reservation
        const { startTime, endTime } = futureWindow(10, 4);
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-existing', VEHICLE_ID, 'admin@dev.local', 'Admin Test', startTime, endTime, 'VALIDATED']
        });

        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'] } } as never);
        // Overlapping window
        const overlapStart = new Date(Date.now() + 11 * 60 * 60 * 1000);
        const overlapEnd = new Date(Date.now() + 12 * 60 * 60 * 1000);
        const res = await POST(
            makeRequest({ startTime: overlapStart.toISOString(), endTime: overlapEnd.toISOString() }),
            { params: Promise.resolve({ id: VEHICLE_ID }) }
        );
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toContain('chevauche');
    });

    it('10. cross-vehicle : même utilisateur peut réserver VL002 en overlap avec VL001 → 201', async () => {
        await seedVehicle({ id: 'VL002', name: 'VL187' });

        const { startTime, endTime } = futureWindow(20, 4);
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-vl001-chvl', 'VL001', 'chvl@dev.local', 'Chauffeur Test', startTime, endTime, 'VALIDATED']
        });

        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'] } } as never);
        const req = new Request('http://localhost/api/vehicles/VL002/reservations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startTime, endTime }),
        });
        const res = await POST(req, { params: Promise.resolve({ id: 'VL002' }) });
        expect(res.status).toBe(201);
    });

    it('11. retourne 409 si CHVL chevauche une réservation PENDING existante', async () => {
        const { startTime, endTime } = futureWindow(30, 4);
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-pending', VEHICLE_ID, 'other@dev.local', 'Other User', startTime, endTime, 'PENDING']
        });

        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'] } } as never);
        const overlapStart = new Date(Date.now() + 31 * 60 * 60 * 1000);
        const overlapEnd = new Date(Date.now() + 32 * 60 * 60 * 1000);
        const res = await POST(
            makeRequest({ startTime: overlapStart.toISOString(), endTime: overlapEnd.toISOString() }),
            { params: Promise.resolve({ id: VEHICLE_ID }) }
        );
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toContain('en attente');
    });

    it('12. ADMIN est bloqué par un overlap PENDING → 409', async () => {
        const { startTime, endTime } = futureWindow(35, 4);
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-pending-2', VEHICLE_ID, 'other@dev.local', 'Other User', startTime, endTime, 'PENDING']
        });

        mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', name: 'Admin Test', roles: ['ADMIN'] } } as never);
        const overlapStart = new Date(Date.now() + 36 * 60 * 60 * 1000);
        const overlapEnd = new Date(Date.now() + 37 * 60 * 60 * 1000);
        const res = await POST(
            makeRequest({ startTime: overlapStart.toISOString(), endTime: overlapEnd.toISOString() }),
            { params: Promise.resolve({ id: VEHICLE_ID }) }
        );
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toContain('en attente');
    });
});
