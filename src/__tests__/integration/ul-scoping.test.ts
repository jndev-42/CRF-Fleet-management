/**
 * Cloisonnement par UL des routes de gestion (`isOutsideUl` → 404).
 *
 * Pour chaque route : un gestionnaire d'une autre UL reçoit 404 et rien n'est écrit,
 * un gestionnaire de la même UL est servi, un SUPER_ADMIN est servi quelle que soit
 * son UL active. L'UL d'une réservation, d'un trajet, d'un incident ou d'un élément
 * de checklist se résout par son véhicule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
    getRenaultVehicleData: vi.fn().mockResolvedValue(null),
    isConnectedInDb: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/push', () => ({
    sendPushNotification: vi.fn().mockResolvedValue(undefined),
    notifyRoles: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/drive', () => ({ deleteDriveFolder: vi.fn().mockResolvedValue(undefined) }));
// Espions : `fetchStatsData` garde son vrai comportement ; le rendu PDF est court-circuité
// pour pouvoir lire les props transmises au document.
vi.mock('@/lib/stats-trips', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/stats-trips')>();
    return { ...actual, fetchStatsData: vi.fn(actual.fetchStatsData) };
});
vi.mock('@react-pdf/renderer', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@react-pdf/renderer')>()),
    renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
}));

import { auth } from '@/auth';
import { renderToBuffer } from '@react-pdf/renderer';
import { fetchStatsData } from '@/lib/stats-trips';
import { db, seedVehicle, seedUser, seedTrip, seedIncident, seedChecklistItem } from './setup';
import { GET as getVehicleReservations, POST as postVehicleReservation } from '@/app/api/vehicles/[id]/reservations/route';
import { DELETE as deleteReservation, PATCH as patchReservation, PUT as putReservation } from '@/app/api/reservations/[id]/route';
import { DELETE as deleteRecurrence, PATCH as patchRecurrence } from '@/app/api/reservations/recurrence/[groupId]/route';
import { DELETE as deleteTrip } from '@/app/api/trips/[id]/route';
import { PATCH as patchTripCheckout } from '@/app/api/trips/[id]/checkout/route';
import { PATCH as patchDesinfPre } from '@/app/api/trips/[id]/desinf-pre/route';
import { PATCH as patchCheckin } from '@/app/api/trips/[id]/checkin/route';
import { PATCH as patchSecondDriver } from '@/app/api/trips/[id]/second-driver/route';
import { PATCH as patchRefreshRenault } from '@/app/api/trips/[id]/refresh-renault/route';
import { PATCH as patchIncident, DELETE as deleteIncident } from '@/app/api/incidents/[id]/route';
import { GET as getChecklist, POST as postChecklist } from '@/app/api/vehicles/[id]/checklist/route';
import { PATCH as patchMetrics } from '@/app/api/vehicles/[id]/metrics/route';
import { GET as getQrToken, POST as postQrToken, DELETE as deleteQrToken } from '@/app/api/vehicles/[id]/qr-token/route';
import { DELETE as deleteVehicle } from '@/app/api/vehicles/[id]/route';
import { POST as postMaintenance } from '@/app/api/vehicles/[id]/maintenance/route';
import { DELETE as deleteMaintenanceRecord } from '@/app/api/vehicles/[id]/maintenance/[recordId]/route';
import { DELETE as deleteChecklistItem } from '@/app/api/checklist/[itemId]/route';
import { GET as getDesinfections } from '@/app/api/vehicles/[id]/desinfections/route';
import { POST as postStatsCsv } from '@/app/api/stats/csv/route';
import { POST as postStatsPdf } from '@/app/api/stats/pdf/route';

const mockedAuth = vi.mocked(auth);

const UL = 'ul-paris-18';
const OTHER_UL = 'ul-lyon-3';
const TODAY = new Date().toISOString().slice(0, 10);

function asUser(roles: string[], ulId: string) {
    mockedAuth.mockResolvedValue({ user: { id: 'manager', email: 'manager@test.com', name: 'Manager', roles, ulId } } as never);
}

function req(method: string, body?: unknown): Request {
    return new Request('http://localhost/api/x', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function seedReservation(id: string, recurrenceGroupId: string | null = null) {
    await db.execute({
        sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status, recurrenceGroupId)
              VALUES (?, 'VL001', 'chvl@test.com', 'Chauffeur', ?, ?, 'PENDING', ?)`,
        args: [id, inHours(24), inHours(26), recurrenceGroupId],
    });
}

async function count(sql: string, args: (string | number)[] = []): Promise<number> {
    const res = await db.execute({ sql, args });
    return Number(res.rows[0].n);
}

beforeEach(async () => {
    await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, status: 'IN_USE', mileage: 10000 });
    await seedUser({ id: 'manager', email: 'manager@test.com', papiers_valides: 1, last_validation: TODAY });
    await seedUser({ id: 'user-driver', email: 'driver@test.com', papiers_valides: 1, last_validation: TODAY });
    await seedUser({ id: 'user-2', email: 'second@test.com', papiers_valides: 1, last_validation: TODAY });
});

interface Case {
    name: string;
    seed?: () => Promise<void>;
    call: () => Promise<Response>;
    okStatus: number;
    /** Valeur témoin, lue avant et après un refus : elle ne doit pas bouger. */
    probe?: () => Promise<unknown>;
}

const tripParams = { params: Promise.resolve({ id: 'trip-1' }) };
const vehicleParams = { params: Promise.resolve({ id: 'VL001' }) };
/** Routes `vehicles/[id]` qui résolvent le véhicule par son nom. */
const vehicleNameParams = { params: Promise.resolve({ id: 'VL186' }) };

const CASES: Case[] = [
    // ── Réservations ───────────────────────────────────────────────────────────
    {
        name: 'GET /api/vehicles/[id]/reservations',
        call: () => getVehicleReservations(req('GET'), vehicleParams),
        okStatus: 200,
    },
    {
        name: 'POST /api/vehicles/[id]/reservations',
        call: () => postVehicleReservation(req('POST', { startTime: inHours(48), endTime: inHours(50) }), vehicleParams),
        okStatus: 201,
        probe: () => count(`SELECT COUNT(*) AS n FROM "Reservation"`),
    },
    {
        name: 'DELETE /api/reservations/[id]',
        seed: () => seedReservation('res-1'),
        call: () => deleteReservation(req('DELETE'), { params: Promise.resolve({ id: 'res-1' }) }),
        okStatus: 200,
        probe: () => count(`SELECT COUNT(*) AS n FROM "Reservation"`),
    },
    {
        name: 'PATCH /api/reservations/[id] (validation)',
        seed: () => seedReservation('res-1'),
        call: () => patchReservation(req('PATCH', { action: 'validate' }), { params: Promise.resolve({ id: 'res-1' }) }),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT status FROM "Reservation" WHERE id = 'res-1'`)).rows[0].status,
    },
    {
        name: 'PUT /api/reservations/[id]',
        seed: () => seedReservation('res-1'),
        call: () => putReservation(req('PUT', { action: 'validate' }), { params: Promise.resolve({ id: 'res-1' }) }),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT status FROM "Reservation" WHERE id = 'res-1'`)).rows[0].status,
    },
    {
        name: 'DELETE /api/reservations/recurrence/[groupId]',
        seed: async () => { await seedReservation('res-1', 'grp-1'); await seedReservation('res-2', 'grp-1'); },
        call: () => deleteRecurrence(req('DELETE'), { params: Promise.resolve({ groupId: 'grp-1' }) }),
        okStatus: 200,
        probe: () => count(`SELECT COUNT(*) AS n FROM "Reservation"`),
    },
    {
        name: 'PATCH /api/reservations/recurrence/[groupId]',
        seed: () => seedReservation('res-1', 'grp-1'),
        call: () => patchRecurrence(req('PATCH'), { params: Promise.resolve({ groupId: 'grp-1' }) }),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT status FROM "Reservation" WHERE id = 'res-1'`)).rows[0].status,
    },
    // ── Trajets ────────────────────────────────────────────────────────────────
    {
        name: 'DELETE /api/trips/[id]',
        seed: () => seedTrip({ id: 'trip-1' }).then(() => undefined),
        call: () => deleteTrip(req('DELETE'), tripParams),
        okStatus: 200,
        probe: () => count(`SELECT COUNT(*) AS n FROM "Trip"`),
    },
    {
        name: 'PATCH /api/trips/[id]/checkout',
        seed: () => seedTrip({ id: 'trip-1' }).then(() => undefined),
        call: () => patchTripCheckout(req('PATCH', {
            driverId: 'user-driver', missionType: 'LOGISTIQUE', mileageOut: 10050, fuelOut: 70, conditionOut: 'BON',
        }), tripParams),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT mileageOut FROM "Trip" WHERE id = 'trip-1'`)).rows[0].mileageOut,
    },
    {
        name: 'PATCH /api/trips/[id]/desinf-pre',
        seed: () => seedTrip({ id: 'trip-1', missionType: 'Désinfection' }).then(() => undefined),
        call: () => patchDesinfPre(req('PATCH', {
            desinfResponsableId: 'user-2', desinfResponsable: 'Second', desinfLotNumber: 'LOT-1',
        }), tripParams),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT desinfLotNumber FROM "Trip" WHERE id = 'trip-1'`)).rows[0].desinfLotNumber,
    },
    {
        name: 'PATCH /api/trips/[id]/checkin',
        seed: () => seedTrip({ id: 'trip-1' }).then(() => undefined),
        call: () => patchCheckin(req('PATCH', { conditionIn: 'BON', mileageIn: 10120, fuelIn: 60 }), tripParams),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT checkInAt FROM "Trip" WHERE id = 'trip-1'`)).rows[0].checkInAt,
    },
    {
        name: 'PATCH /api/trips/[id]/second-driver',
        seed: () => seedTrip({ id: 'trip-1' }).then(() => undefined),
        call: () => patchSecondDriver(req('PATCH', { secondDriverId: 'user-2' }), tripParams),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT secondDriverId FROM "Trip" WHERE id = 'trip-1'`)).rows[0].secondDriverId,
    },
    {
        name: 'PATCH /api/trips/[id]/refresh-renault',
        seed: () => seedTrip({ id: 'trip-1', checkInAt: new Date().toISOString(), mileageIn: 10100, fuelIn: 60 }).then(() => undefined),
        call: () => patchRefreshRenault(req('PATCH'), tripParams),
        okStatus: 200,
    },
    // ── Incidents ──────────────────────────────────────────────────────────────
    {
        name: 'PATCH /api/incidents/[id]',
        seed: () => seedIncident({ id: 'incident-1', userId: 'user-driver' }).then(() => undefined),
        call: () => patchIncident(req('PATCH', { description: 'modifié' }), { params: Promise.resolve({ id: 'incident-1' }) }),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT description FROM "IncidentReport" WHERE id = 'incident-1'`)).rows[0].description,
    },
    {
        name: 'DELETE /api/incidents/[id]',
        seed: () => seedIncident({ id: 'incident-1', userId: 'user-driver' }).then(() => undefined),
        call: () => deleteIncident(req('DELETE'), { params: Promise.resolve({ id: 'incident-1' }) }),
        okStatus: 200,
        probe: () => count(`SELECT COUNT(*) AS n FROM "IncidentReport"`),
    },
    // ── Véhicule ───────────────────────────────────────────────────────────────
    {
        name: 'GET /api/vehicles/[id]/checklist',
        call: () => getChecklist(new Request('http://localhost/api/vehicles/VL001/checklist?type=checkout'), vehicleParams),
        okStatus: 200,
    },
    {
        name: 'POST /api/vehicles/[id]/checklist',
        call: () => postChecklist(req('POST', { label: 'Pneus', type: 'checkout' }), vehicleParams),
        okStatus: 201,
        probe: () => count(`SELECT COUNT(*) AS n FROM "VehicleChecklistItem"`),
    },
    {
        name: 'PATCH /api/vehicles/[id]/metrics',
        call: () => patchMetrics(req('PATCH', { mileage: 12000 }), vehicleParams),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT mileage FROM "Vehicle" WHERE id = 'VL001'`)).rows[0].mileage,
    },
    {
        name: 'GET /api/vehicles/[id]/qr-token',
        call: () => getQrToken(req('GET'), vehicleParams),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT qrToken FROM "Vehicle" WHERE id = 'VL001'`)).rows[0].qrToken,
    },
    {
        name: 'POST /api/vehicles/[id]/qr-token',
        call: () => postQrToken(req('POST'), vehicleParams),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT qrToken FROM "Vehicle" WHERE id = 'VL001'`)).rows[0].qrToken,
    },
    {
        name: 'DELETE /api/vehicles/[id]/qr-token',
        call: () => deleteQrToken(req('DELETE'), vehicleParams),
        okStatus: 200,
        probe: async () => (await db.execute(`SELECT qrToken FROM "Vehicle" WHERE id = 'VL001'`)).rows[0].qrToken,
    },
    {
        name: 'DELETE /api/vehicles/[id]',
        call: () => deleteVehicle(req('DELETE'), vehicleNameParams),
        okStatus: 200,
        probe: () => count(`SELECT COUNT(*) AS n FROM "Vehicle"`),
    },
    {
        name: 'POST /api/vehicles/[id]/maintenance',
        call: () => postMaintenance(req('POST', { date: '2026-10-01', type: 'REVISION', mileage: 10000 }), vehicleNameParams),
        okStatus: 201,
        probe: () => count(`SELECT COUNT(*) AS n FROM "VehicleMaintenanceRecord"`),
    },
    {
        name: 'DELETE /api/vehicles/[id]/maintenance/[recordId]',
        seed: async () => {
            await db.execute(`INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type) VALUES ('rec-1', 'VL001', '2026-10-01', 'REVISION')`);
        },
        call: () => deleteMaintenanceRecord(req('DELETE'), { params: Promise.resolve({ id: 'VL186', recordId: 'rec-1' }) }),
        okStatus: 200,
        probe: () => count(`SELECT COUNT(*) AS n FROM "VehicleMaintenanceRecord"`),
    },
    {
        name: 'DELETE /api/checklist/[itemId]',
        seed: () => seedChecklistItem({ id: 'item-1' }).then(() => undefined),
        call: () => deleteChecklistItem(req('DELETE'), { params: Promise.resolve({ itemId: 'item-1' }) }),
        okStatus: 200,
        probe: () => count(`SELECT COUNT(*) AS n FROM "VehicleChecklistItem"`),
    },
    {
        name: 'GET /api/vehicles/[id]/desinfections',
        call: () => getDesinfections(req('GET'), vehicleNameParams),
        okStatus: 200,
    },
];

describe.each(CASES)('$name', (c) => {
    it("gestionnaire d'une autre UL → 404, rien n'est écrit", async () => {
        await c.seed?.();
        const before = await c.probe?.();
        asUser(['ADMIN'], OTHER_UL);
        const res = await c.call();
        expect(res.status).toBe(404);
        if (c.probe) expect(await c.probe()).toEqual(before);
    });

    it('RESP_VEHICULE d\'une autre UL → 404', async () => {
        await c.seed?.();
        asUser(['RESP_VEHICULE'], OTHER_UL);
        expect((await c.call()).status).toBe(404);
    });

    it('session sans UL active (`default`) → 404', async () => {
        await c.seed?.();
        asUser(['ADMIN'], 'default');
        expect((await c.call()).status).toBe(404);
    });

    it('gestionnaire de la même UL → autorisé', async () => {
        await c.seed?.();
        asUser(['ADMIN'], UL);
        expect((await c.call()).status).toBe(c.okStatus);
    });

    it('SUPER_ADMIN, quelle que soit son UL active → autorisé', async () => {
        await c.seed?.();
        asUser(['SUPER_ADMIN'], OTHER_UL);
        expect((await c.call()).status).toBe(c.okStatus);
    });
});

describe('conducteurs du trajet : hors cloisonnement (emprunt QR inter-UL)', () => {
    it('le conducteur principal rend son trajet sur un véhicule d\'une autre UL', async () => {
        await seedTrip({ id: 'trip-1', driverId: 'manager' });
        asUser(['CHVL'], OTHER_UL);
        const res = await patchCheckin(req('PATCH', { conditionIn: 'BON', mileageIn: 10120, fuelIn: 60 }), tripParams);
        expect(res.status).toBe(200);
    });

    it('le conducteur principal désigne un second conducteur sur un véhicule d\'une autre UL', async () => {
        await seedTrip({ id: 'trip-1', driverId: 'manager' });
        asUser(['CHVL'], OTHER_UL);
        const res = await patchSecondDriver(req('PATCH', { secondDriverId: 'user-2' }), tripParams);
        expect(res.status).toBe(200);
    });

    it('le second conducteur rend le trajet sur un véhicule d\'une autre UL', async () => {
        await seedTrip({ id: 'trip-1', driverId: 'user-driver', secondDriverId: 'manager' });
        asUser(['CHVL'], OTHER_UL);
        const res = await patchCheckin(req('PATCH', { conditionIn: 'BON', mileageIn: 10120, fuelIn: 60 }), tripParams);
        expect(res.status).toBe(200);
    });

    it('le conducteur relance la vérification Renault de son trajet sur un véhicule d\'une autre UL', async () => {
        await seedTrip({ id: 'trip-1', driverId: 'manager', checkInAt: new Date().toISOString(), mileageIn: 10100, fuelIn: 60 });
        asUser(['CHVL'], OTHER_UL);
        expect((await patchRefreshRenault(req('PATCH'), tripParams)).status).toBe(200);
    });

    it('l\'auteur supprime son incident sur un véhicule d\'une autre UL', async () => {
        await seedIncident({ id: 'incident-1', userId: 'manager' });
        asUser(['CHVL'], OTHER_UL);
        const res = await deleteIncident(req('DELETE'), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(200);
        expect(await count(`SELECT COUNT(*) AS n FROM "IncidentReport"`)).toBe(0);
    });

    it('l\'auteur modifie son incident sur un véhicule d\'une autre UL', async () => {
        await seedIncident({ id: 'incident-1', userId: 'manager' });
        asUser(['CHVL'], OTHER_UL);
        const res = await patchIncident(req('PATCH', { description: 'complété' }), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(200);
    });
});

describe('reservations/recurrence/[groupId] — chaque véhicule du groupe est vérifié', () => {
    beforeEach(async () => {
        await seedVehicle({ id: 'VL-LYON', name: 'VL LYON', ulId: OTHER_UL, plate: 'ZZ-999-ZZ' });
        await seedReservation('res-1', 'grp-1');
        await db.execute({
            sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status, recurrenceGroupId)
                  VALUES ('res-2', 'VL-LYON', 'chvl@test.com', 'Chauffeur', ?, ?, 'PENDING', 'grp-1')`,
            args: [inHours(30), inHours(32)],
        });
        asUser(['ADMIN'], UL);
    });

    it('DELETE : un groupe mêlant un véhicule hors UL est refusé en entier (404)', async () => {
        expect((await deleteRecurrence(req('DELETE'), { params: Promise.resolve({ groupId: 'grp-1' }) })).status).toBe(404);
        expect(await count(`SELECT COUNT(*) AS n FROM "Reservation"`)).toBe(2);
    });

    it('PATCH : un groupe mêlant un véhicule hors UL est refusé en entier (404)', async () => {
        expect((await patchRecurrence(req('PATCH'), { params: Promise.resolve({ groupId: 'grp-1' }) })).status).toBe(404);
        expect(await count(`SELECT COUNT(*) AS n FROM "Reservation" WHERE status = 'PENDING'`)).toBe(2);
    });
});

describe('exports de stats limités à l\'UL de session', () => {
    beforeEach(async () => {
        await seedVehicle({ id: 'VL-LYON', name: 'VL LYON', ulId: OTHER_UL, plate: 'ZZ-999-ZZ' });
        await seedTrip({ id: 'trip-paris', vehicleId: 'VL001', checkInAt: new Date().toISOString(), mileageIn: 10100, fuelIn: 60 });
        await seedTrip({ id: 'trip-lyon', vehicleId: 'VL-LYON', checkInAt: new Date().toISOString(), mileageIn: 10100, fuelIn: 60 });
    });

    const body = { dateFrom: TODAY, dateTo: TODAY };

    it('stats/csv : n\'exporte que les trajets des véhicules de l\'UL de session', async () => {
        asUser(['CHVL'], UL);
        const res = await postStatsCsv(req('POST', body));
        expect(res.status).toBe(200);
        const csv = await res.text();
        expect(csv).toContain('VL186');
        expect(csv).not.toContain('VL LYON');
    });

    it.each([['default'], ['']])('stats/csv : 400 si l\'UL de session vaut %j', async (ulId) => {
        asUser(['ADMIN'], ulId);
        expect((await postStatsCsv(req('POST', body))).status).toBe(400);
    });

    it('stats/pdf : fetchStatsData reçoit l\'UL de session et l\'incident d\'une autre UL est exclu', async () => {
        await db.execute(`UPDATE Trip SET incident = 'Rayure Paris' WHERE id = 'trip-paris'`);
        await db.execute(`UPDATE Trip SET incident = 'Rayure Lyon' WHERE id = 'trip-lyon'`);
        asUser(['CHVL'], UL);

        const res = await postStatsPdf(req('POST', body));
        expect(res.status).toBe(200);
        expect(vi.mocked(fetchStatsData)).toHaveBeenCalledWith(TODAY, TODAY, { ulId: UL });
        const element = vi.mocked(renderToBuffer).mock.calls.at(-1)![0] as unknown as {
            props: { incidentRows: { vehicleName: string; incident: string }[] };
        };
        expect(element.props.incidentRows.map(r => r.incident)).toEqual(['Rayure Paris']);
    });

    it.each([['default'], ['']])('stats/pdf : 400 si l\'UL de session vaut %j', async (ulId) => {
        asUser(['ADMIN'], ulId);
        expect((await postStatsPdf(req('POST', body))).status).toBe(400);
    });
});
