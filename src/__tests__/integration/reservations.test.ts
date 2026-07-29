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
import { PATCH as PATCH_RESERVATION, DELETE as DELETE_RESERVATION } from '@/app/api/reservations/[id]/route';
import { DELETE as DELETE_RECURRENCE } from '@/app/api/reservations/recurrence/[groupId]/route';
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
        expect(body.error).toContain('responsable');
    });

    it('3. autorise un RESPO ou CADRE à utiliser onBehalfOfUserId (201)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'respo@dev.local', name: 'Respo Test', roles: ['RESPO'] } } as never);
        const { startTime, endTime } = futureWindow();
        const res = await POST(makeRequest({ startTime, endTime, onBehalfOfUserId: 'user-target' }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(201);
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

describe('POST & PATCH /api/reservations — Chauffeur non décidé & modifications', () => {
    it('13. permet à un ADMIN/CADRE de créer une réservation avec "Chauffeur non décidé"', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', name: 'Admin Test', roles: ['ADMIN'] } } as never);
        const { startTime, endTime } = futureWindow(40, 2);
        const res = await POST(makeRequest({ startTime, endTime, reason: 'Transport urgent', isUnassignedDriver: true }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(201);
        const body = await res.json();

        const rows = await db.execute({ sql: `SELECT * FROM "Reservation" WHERE id = ?`, args: [body.id] });
        expect(rows.rows[0].userName).toBe('Chauffeur non décidé');
    });

    it('14. bloque un utilisateur simple (CHVL) qui tente de réserver comme "Chauffeur non décidé" ou pour autrui (403)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'] } } as never);
        const { startTime, endTime } = futureWindow(45, 2);
        const res = await POST(makeRequest({ startTime, endTime, isUnassignedDriver: true }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(403);
    });

    it('15. permet au propriétaire CHVL de modifier sa réservation (motif et dates)', async () => {
        const { startTime, endTime } = futureWindow(50, 2);
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, reason, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-to-edit', VEHICLE_ID, 'chvl@dev.local', 'Chauffeur Test', startTime, endTime, 'Initial Reason', 'VALIDATED']
        });

        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'] } } as never);

        const newStart = new Date(Date.now() + 51 * 60 * 60 * 1000).toISOString();
        const newEnd = new Date(Date.now() + 54 * 60 * 60 * 1000).toISOString();

        const patchReq = new Request('http://localhost/api/reservations/res-to-edit', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update',
                startTime: newStart,
                endTime: newEnd,
                reason: 'Motif mis à jour'
            })
        });

        const res = await PATCH_RESERVATION(patchReq, { params: Promise.resolve({ id: 'res-to-edit' }) });
        expect(res.status).toBe(200);

        const rows = await db.execute({ sql: `SELECT * FROM "Reservation" WHERE id = 'res-to-edit'`, args: [] });
        expect(rows.rows[0].reason).toBe('Motif mis à jour');
        expect(rows.rows[0].startTime).toBe(newStart);
        expect(rows.rows[0].endTime).toBe(newEnd);
    });

    it('16. empêche un utilisateur simple de modifier le chauffeur d\'une réservation (403)', async () => {
        const { startTime, endTime } = futureWindow(55, 2);
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, reason, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-change-driver', VEHICLE_ID, 'chvl@dev.local', 'Chauffeur Test', startTime, endTime, 'Reason', 'VALIDATED']
        });

        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'] } } as never);

        const patchReq = new Request('http://localhost/api/reservations/res-change-driver', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update',
                isUnassignedDriver: true
            })
        });

        const res = await PATCH_RESERVATION(patchReq, { params: Promise.resolve({ id: 'res-change-driver' }) });
        expect(res.status).toBe(403);
    });

    it('17. permet à un ADMIN/CADRE de modifier le chauffeur vers "Chauffeur non décidé"', async () => {
        const { startTime, endTime } = futureWindow(60, 2);
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, reason, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-admin-edit', VEHICLE_ID, 'chvl@dev.local', 'Chauffeur Test', startTime, endTime, 'Reason', 'VALIDATED']
        });

        mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', name: 'Admin Test', roles: ['ADMIN'] } } as never);

        const patchReq = new Request('http://localhost/api/reservations/res-admin-edit', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update',
                isUnassignedDriver: true
            })
        });

        const res = await PATCH_RESERVATION(patchReq, { params: Promise.resolve({ id: 'res-admin-edit' }) });
        expect(res.status).toBe(200);

        const rows = await db.execute({ sql: `SELECT * FROM "Reservation" WHERE id = 'res-admin-edit'`, args: [] });
        expect(rows.rows[0].userName).toBe('Chauffeur non décidé');
    });

    it('18. bloque la modification par un autre utilisateur non-admin (403)', async () => {
        const { startTime, endTime } = futureWindow(65, 2);
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, reason, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-other', VEHICLE_ID, 'other@dev.local', 'Other User', startTime, endTime, 'Reason', 'PENDING']
        });

        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'] } } as never);

        const patchReq = new Request('http://localhost/api/reservations/res-other', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update',
                reason: 'Hack'
            })
        });

        const res = await PATCH_RESERVATION(patchReq, { params: Promise.resolve({ id: 'res-other' }) });
        expect(res.status).toBe(403);
    });

    it('19. bloque la modification de dates si elle entre en conflit avec une autre réservation (409)', async () => {
        const win1 = futureWindow(70, 2);
        const win2 = futureWindow(75, 2);

        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-A', VEHICLE_ID, 'chvl@dev.local', 'Chauffeur Test', win1.startTime, win1.endTime, 'VALIDATED']
        });
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-B', VEHICLE_ID, 'admin@dev.local', 'Admin Test', win2.startTime, win2.endTime, 'VALIDATED']
        });

        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'] } } as never);

        const patchReq = new Request('http://localhost/api/reservations/res-A', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update',
                startTime: win1.startTime,
                endTime: win2.endTime
            })
        });

        const res = await PATCH_RESERVATION(patchReq, { params: Promise.resolve({ id: 'res-A' }) });
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toContain('chevauche');
    });
});

describe('Droits des rôles CADRE et PRESIDENT sur les réservations', () => {
    it('20. CADRE crée une réservation → statut VALIDATED directement', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'cadre@dev.local', name: 'Cadre Test', roles: ['CADRE'] } } as never);
        const { startTime, endTime } = futureWindow(80, 2);
        const res = await POST(makeRequest({ startTime, endTime, reason: 'Mission Cadre' }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.status).toBe('VALIDATED');
    });

    it('21. PRESIDENT crée une réservation → statut VALIDATED directement', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'president@dev.local', name: 'President Test', roles: ['PRESIDENT'] } } as never);
        const { startTime, endTime } = futureWindow(85, 2);
        const res = await POST(makeRequest({ startTime, endTime, reason: 'Mission Président' }), { params: Promise.resolve({ id: VEHICLE_ID }) });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.status).toBe('VALIDATED');
    });

    it('22. CADRE et PRESIDENT peuvent valider une réservation PENDING créée par un chauffeur', async () => {
        const { startTime, endTime } = futureWindow(90, 2);
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-pending-chvl', VEHICLE_ID, 'chvl@dev.local', 'Chauffeur Test', startTime, endTime, 'PENDING']
        });

        // Test valider avec CADRE
        mockedAuth.mockResolvedValue({ user: { email: 'cadre@dev.local', name: 'Cadre Test', roles: ['CADRE'] } } as never);
        const reqCadre = new Request('http://localhost/api/reservations/res-pending-chvl', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'validate' })
        });
        const resCadre = await PATCH_RESERVATION(reqCadre, { params: Promise.resolve({ id: 'res-pending-chvl' }) });
        expect(resCadre.status).toBe(200);

        const checkCadre = await db.execute({ sql: `SELECT status FROM "Reservation" WHERE id = 'res-pending-chvl'`, args: [] });
        expect(checkCadre.rows[0].status).toBe('VALIDATED');
    });

    it('23. CADRE et PRESIDENT peuvent supprimer une réservation d\'un autre chauffeur', async () => {
        const { startTime, endTime } = futureWindow(95, 2);
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-to-delete-cadre', VEHICLE_ID, 'chvl@dev.local', 'Chauffeur Test', startTime, endTime, 'VALIDATED']
        });

        mockedAuth.mockResolvedValue({ user: { email: 'cadre@dev.local', name: 'Cadre Test', roles: ['CADRE'] } } as never);
        const reqDelete = new Request('http://localhost/api/reservations/res-to-delete-cadre', { method: 'DELETE' });
        const resDelete = await DELETE_RESERVATION(reqDelete, { params: Promise.resolve({ id: 'res-to-delete-cadre' }) });
        expect(resDelete.status).toBe(200);

        const checkDelete = await db.execute({ sql: `SELECT * FROM "Reservation" WHERE id = 'res-to-delete-cadre'`, args: [] });
        expect(checkDelete.rows.length).toBe(0);
    });

    it('24. PRESIDENT peut annuler un groupe de récurrence créé par un autre chauffeur', async () => {
        const { startTime, endTime } = futureWindow(100, 2);
        const groupId = 'group-to-delete-president';
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status, recurrenceGroupId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['res-rec-1', VEHICLE_ID, 'chvl@dev.local', 'Chauffeur Test', startTime, endTime, 'VALIDATED', groupId]
        });

        mockedAuth.mockResolvedValue({ user: { email: 'president@dev.local', name: 'President Test', roles: ['PRESIDENT'] } } as never);
        const reqRecDelete = new Request(`http://localhost/api/reservations/recurrence/${groupId}`, { method: 'DELETE' });
        const resRecDelete = await DELETE_RECURRENCE(reqRecDelete, { params: Promise.resolve({ groupId }) });
        expect(resRecDelete.status).toBe(200);

        const checkGroup = await db.execute({ sql: `SELECT * FROM "Reservation" WHERE recurrenceGroupId = ?`, args: [groupId] });
        expect(checkGroup.rows.length).toBe(0);
    });
});


