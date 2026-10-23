/**
 * Tests d'intégration — rôle RESP_VEHICULE (responsable véhicule).
 *
 * Dans son UL, il a sur les véhicules les droits d'un ADMIN (`canManageVehicles`) ;
 * hors de son UL, il est refusé comme un ADMIN ; hors véhicules, il n'a aucun droit
 * d'administration. Le CADRE, lui, perd la gestion des véhicules. Une assertion par
 * famille de routes : véhicule, trajet, incident, puis les modules fermés.
 *
 * Les réservations sont couvertes dans `reservations.test.ts`, les métriques et le
 * QR véhicule dans `vehicles-metrics.test.ts` et `vehicles-qr-token.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/drive', () => ({ deleteDriveFolder: vi.fn() }));
vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
    getRenaultVehicleData: vi.fn().mockResolvedValue(null),
    isConnectedInDb: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/r2', () => ({
    putObject: vi.fn(async () => {}),
    getObject: vi.fn(async () => null),
    deleteObject: vi.fn(async () => {}),
    buildVehicleGuideKey: (vehicleId: string, attempt: string) => `vehicle-guides/${vehicleId}/${attempt}.pdf`,
    newAttemptId: () => 'att1',
    R2Error: class R2Error extends Error {},
}));
vi.mock('@/lib/push', () => ({
    sendPushNotification: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
    notifyRoles: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from '@/auth';
import { PATCH as patchVehicle } from '@/app/api/vehicles/[id]/route';
import { POST as postTrip } from '@/app/api/trips/route';
import { PATCH as checkinTrip } from '@/app/api/trips/[id]/checkin/route';
import { GET as getIncident } from '@/app/api/incidents/[id]/route';
import { GET as getUsers } from '@/app/api/users/route';
import { GET as getExpenseStats } from '@/app/api/stats/expenses/route';
import { POST as postInventory } from '@/app/api/inventory/route';
import { GET as getMissions } from '@/app/api/missions/route';
import { POST as postVehicle } from '@/app/api/vehicles/route';
import { DELETE as deleteVehicle } from '@/app/api/vehicles/[id]/route';
import { DELETE as deleteGuide } from '@/app/api/vehicles/[id]/guide/route';
import { POST as postMaintenance } from '@/app/api/vehicles/[id]/maintenance/route';
import { POST as postMaintenanceEvent } from '@/app/api/vehicles/[id]/maintenance-events/route';
import { POST as postChecklistItem } from '@/app/api/vehicles/[id]/checklist/route';
import { DELETE as deleteTrip } from '@/app/api/trips/[id]/route';
import { PATCH as patchCheckout } from '@/app/api/trips/[id]/checkout/route';
import { PATCH as patchDesinfPre } from '@/app/api/trips/[id]/desinf-pre/route';
import { PATCH as patchSecondDriver } from '@/app/api/trips/[id]/second-driver/route';
import { POST as postQrCheckin } from '@/app/api/qr/[token]/checkin/route';
import { PATCH as patchIncident } from '@/app/api/incidents/[id]/route';
import { db, seedRoles, seedUser, seedUserRole, seedUserUL, seedUniteLocale, seedVehicle, seedTrip, seedIncident } from './setup';

const mockedAuth = vi.mocked(auth);

const UL = 'ul-paris-18';
const OTHER_UL = 'ul-lyon-3';

function asUser(roles: string[], ulId = UL) {
    mockedAuth.mockResolvedValue({ user: { id: 'user-rv', email: 'rv@test.com', name: 'Resp Véhicule', roles, ulId } } as never);
}

function patchVehicleRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/vehicles/VL186', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function jsonRequest(url: string, method: string, body: Record<string, unknown>): Request {
    return new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

beforeEach(async () => {
    vi.clearAllMocks();
    await seedRoles();
    await seedUser({ id: 'user-rv', email: 'rv@test.com', name: 'Resp Véhicule' });
    await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Chauffeur' });
});

describe('véhicule — PATCH /api/vehicles/[id]', () => {
    it('RESP_VEHICULE édite un véhicule de son UL', async () => {
        asUser(['RESP_VEHICULE']);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, maxFuelCapacity: 56 });

        const res = await patchVehicle(patchVehicleRequest({ maxFuelCapacity: 80 }), { params: Promise.resolve({ id: 'VL186' }) });
        expect(res.status).toBe(200);
        const row = await db.execute({ sql: `SELECT maxFuelCapacity FROM "Vehicle" WHERE id = 'VL001'`, args: [] });
        expect(row.rows[0].maxFuelCapacity).toBe(80);
    });

    it('RESP_VEHICULE est refusé sur le véhicule d\'une autre UL (403)', async () => {
        asUser(['RESP_VEHICULE'], OTHER_UL);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, maxFuelCapacity: 56 });

        const res = await patchVehicle(patchVehicleRequest({ maxFuelCapacity: 80 }), { params: Promise.resolve({ id: 'VL186' }) });
        expect(res.status).toBe(403);
    });

    it('CADRE seul ne peut plus éditer un véhicule (403)', async () => {
        asUser(['CADRE']);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL });

        const res = await patchVehicle(patchVehicleRequest({ maxFuelCapacity: 80 }), { params: Promise.resolve({ id: 'VL186' }) });
        expect(res.status).toBe(403);
    });

    it('RESP_VEHICULE inactif est refusé (403)', async () => {
        asUser(['RESP_VEHICULE', 'INACTIF']);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL });

        const res = await patchVehicle(patchVehicleRequest({ maxFuelCapacity: 80 }), { params: Promise.resolve({ id: 'VL186' }) });
        expect(res.status).toBe(403);
    });
});

describe('trajet — POST /api/trips et PATCH /api/trips/[id]/checkin', () => {
    const checkOutBody = { vehicleId: 'VL001', missionType: 'LOGISTIQUE', conditionOut: 'BON', dsaChecked: false };

    it('RESP_VEHICULE emprunte un véhicule de son UL sans rôle chauffeur (bypass ADMIN)', async () => {
        asUser(['RESP_VEHICULE']);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, status: 'AVAILABLE', mileage: 10000 });

        const res = await postTrip(jsonRequest('http://localhost/api/trips', 'POST', checkOutBody));
        expect(res.status).toBe(201);
    });

    it('RESP_VEHICULE est refusé sur le véhicule d\'une autre UL (404 indiscernable, cf. isOutsideUl)', async () => {
        asUser(['RESP_VEHICULE'], OTHER_UL);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, status: 'AVAILABLE', mileage: 10000 });

        const res = await postTrip(jsonRequest('http://localhost/api/trips', 'POST', checkOutBody));
        expect(res.status).toBe(404);
        const trips = await db.execute(`SELECT id FROM "Trip"`);
        expect(trips.rows).toHaveLength(0);
    });

    it('RESP_VEHICULE clôture le trajet d\'un autre chauffeur', async () => {
        asUser(['RESP_VEHICULE']);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, status: 'IN_USE', mileage: 10000 });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', mileageOut: 10000 });

        const res = await checkinTrip(
            jsonRequest('http://localhost/api/trips/trip-1/checkin', 'PATCH', { conditionIn: 'BON', mileageIn: 10120, fuelIn: 60 }),
            { params: Promise.resolve({ id: 'trip-1' }) },
        );
        expect(res.status).toBe(200);
    });

    it('CADRE seul ne clôture pas le trajet d\'autrui (403)', async () => {
        asUser(['CADRE']);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, status: 'IN_USE', mileage: 10000 });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', mileageOut: 10000 });

        const res = await checkinTrip(
            jsonRequest('http://localhost/api/trips/trip-1/checkin', 'PATCH', { conditionIn: 'BON', mileageIn: 10120, fuelIn: 60 }),
            { params: Promise.resolve({ id: 'trip-1' }) },
        );
        expect(res.status).toBe(403);
    });
});

describe('incident — GET /api/incidents/[id]', () => {
    it('RESP_VEHICULE lit le brouillon d\'autrui dans son UL, auteur révélé', async () => {
        asUser(['RESP_VEHICULE']);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-driver', status: 'DRAFT' });

        const res = await getIncident(new Request('http://localhost/api/incidents/incident-1'), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.userId).toBe('user-driver');
    });

    it('RESP_VEHICULE est refusé sur l\'incident d\'une autre UL (403)', async () => {
        asUser(['RESP_VEHICULE'], OTHER_UL);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-driver', status: 'SUBMITTED' });

        const res = await getIncident(new Request('http://localhost/api/incidents/incident-1'), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(403);
    });

    it('CADRE seul ne lit pas le brouillon d\'autrui (403)', async () => {
        asUser(['CADRE']);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-driver', status: 'DRAFT' });

        const res = await getIncident(new Request('http://localhost/api/incidents/incident-1'), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(403);
    });
});

describe('hors véhicules : aucun droit d\'administration', () => {
    beforeEach(() => asUser(['RESP_VEHICULE']));

    it('GET /api/users sans filtre → 403', async () => {
        const res = await getUsers(new Request('http://localhost/api/users'));
        expect(res.status).toBe(403);
    });

    it('GET /api/stats/expenses → 403', async () => {
        const res = await getExpenseStats(new Request('http://localhost/api/stats/expenses?dateFrom=2026-01-01&dateTo=2026-01-31'));
        expect(res.status).toBe(403);
    });

    it('POST /api/inventory → 403', async () => {
        const res = await postInventory(jsonRequest('http://localhost/api/inventory', 'POST', { name: 'Compresses' }));
        expect(res.status).toBe(403);
    });

    it('GET /api/missions → 403', async () => {
        const res = await getMissions(new Request('http://localhost/api/missions'));
        expect(res.status).toBe(403);
    });
});

describe('sélecteurs de conducteur — GET /api/users filtré', () => {
    beforeEach(async () => {
        await seedUniteLocale({ id: UL, name: 'Paris 18', slug: 'paris-18' });
        await seedUniteLocale({ id: OTHER_UL, name: 'Lyon 3', slug: 'lyon-3' });
        await seedUser({ id: 'vl-here', email: 'a-vl@test.com', name: 'VL Paris' });
        await seedUserRole('vl-here', 'CHVL');
        await seedUserUL({ userId: 'vl-here', ulId: UL, roles: ['CHVL'] });
        await seedUser({ id: 'vpsp-here', email: 'b-vpsp@test.com', name: 'VPSP Paris' });
        await seedUserRole('vpsp-here', 'CHVPSP');
        await seedUserUL({ userId: 'vpsp-here', ulId: UL, roles: ['CHVPSP'] });
        await seedUser({ id: 'vl-lyon', email: 'c-vl@test.com', name: 'VL Lyon' });
        await seedUserRole('vl-lyon', 'CHVL');
        await seedUserUL({ userId: 'vl-lyon', ulId: OTHER_UL, roles: ['CHVL'] });
    });

    it('RESP_VEHICULE avec ?vehicleType=VL → 200, chauffeurs VL de son UL seulement, champs réduits', async () => {
        asUser(['RESP_VEHICULE']);
        const res = await getUsers(new Request('http://localhost/api/users?vehicleType=VL'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.users).toEqual([{ id: 'vl-here', name: 'VL Paris', email: 'a-vl@test.com' }]);
        expect(body.availableRoles).toBeUndefined();
    });

    it('RESP_VEHICULE avec ?drivers=true → chauffeurs VL et VPSP de son UL', async () => {
        asUser(['RESP_VEHICULE']);
        const res = await getUsers(new Request('http://localhost/api/users?drivers=true'));
        expect(res.status).toBe(200);
        const ids = (await res.json()).users.map((u: { id: string }) => u.id);
        expect(ids).toEqual(['vl-here', 'vpsp-here']);
    });

    it('RESP_VEHICULE avec un type libre (?vehicleType=VPSP 4x4) → chauffeurs CHVPSP de son UL', async () => {
        asUser(['RESP_VEHICULE']);
        const res = await getUsers(new Request(`http://localhost/api/users?vehicleType=${encodeURIComponent('VPSP 4x4')}`));
        expect(res.status).toBe(200);
        expect((await res.json()).users).toEqual([{ id: 'vpsp-here', name: 'VPSP Paris', email: 'b-vpsp@test.com' }]);
    });

    it('RESP_VEHICULE avec un type non VPSP (?vehicleType=Utilitaire) → chauffeurs CHVL de son UL', async () => {
        asUser(['RESP_VEHICULE']);
        const res = await getUsers(new Request('http://localhost/api/users?vehicleType=Utilitaire'));
        expect(res.status).toBe(200);
        expect((await res.json()).users).toEqual([{ id: 'vl-here', name: 'VL Paris', email: 'a-vl@test.com' }]);
    });

    it('RESP_VEHICULE sans UL de session → liste vide', async () => {
        asUser(['RESP_VEHICULE'], 'default');
        const res = await getUsers(new Request('http://localhost/api/users?vehicleType=VL'));
        expect(res.status).toBe(200);
        expect((await res.json()).users).toEqual([]);
    });

    it('RESP_VEHICULE inactif avec filtre → 403', async () => {
        asUser(['RESP_VEHICULE', 'INACTIF']);
        const res = await getUsers(new Request('http://localhost/api/users?vehicleType=VL'));
        expect(res.status).toBe(403);
    });

    it('CHVL avec filtre → 403 (inchangé)', async () => {
        asUser(['CHVL']);
        const res = await getUsers(new Request('http://localhost/api/users?vehicleType=VL'));
        expect(res.status).toBe(403);
    });
});

// Échantillon des gardes passées à `canManageVehicles` : un RESP_VEHICULE de l'UL du
// véhicule n'y reçoit jamais 403. Le statut exact (200, 400 de validation, 404…) n'est
// pas l'objet de ce test — seule l'absence de refus d'autorisation l'est.
describe('gardes canManageVehicles — pas de 403 pour RESP_VEHICULE dans son UL', () => {
    const byId = (id: string) => ({ params: Promise.resolve({ id }) });
    const cases: [string, () => Promise<Response>][] = [
        ['POST /api/vehicles', () => postVehicle(jsonRequest('http://localhost/api/vehicles', 'POST', { name: 'VL999', type: 'VL', plate: 'ZZ-999-ZZ' }))],
        ['DELETE /api/vehicles/[id]', () => deleteVehicle(new Request('http://localhost/api/vehicles/VL186', { method: 'DELETE' }), byId('VL186'))],
        ['DELETE /api/vehicles/[id]/guide', () => deleteGuide(new Request('http://localhost/api/vehicles/VL186/guide', { method: 'DELETE' }), byId('VL186'))],
        ['POST /api/vehicles/[id]/maintenance', () => postMaintenance(jsonRequest('http://localhost/api/vehicles/VL186/maintenance', 'POST', {}), byId('VL186'))],
        ['POST /api/vehicles/[id]/maintenance-events', () => postMaintenanceEvent(jsonRequest('http://localhost/api/vehicles/VL001/maintenance-events', 'POST', {}), byId('VL001'))],
        ['POST /api/vehicles/[id]/checklist', () => postChecklistItem(jsonRequest('http://localhost/api/vehicles/VL001/checklist', 'POST', {}), byId('VL001'))],
        ['DELETE /api/trips/[id]', () => deleteTrip(new Request('http://localhost/api/trips/trip-1', { method: 'DELETE' }), byId('trip-1'))],
        ['PATCH /api/trips/[id]/checkout', () => patchCheckout(jsonRequest('http://localhost/api/trips/trip-1/checkout', 'PATCH', {}), byId('trip-1'))],
        ['PATCH /api/trips/[id]/desinf-pre', () => patchDesinfPre(jsonRequest('http://localhost/api/trips/trip-1/desinf-pre', 'PATCH', {}), byId('trip-1'))],
        ['PATCH /api/trips/[id]/second-driver', () => patchSecondDriver(jsonRequest('http://localhost/api/trips/trip-1/second-driver', 'PATCH', { secondDriverId: 'user-rv' }), byId('trip-1'))],
        ['POST /api/qr/[token]/checkin', () => postQrCheckin(
            jsonRequest('http://localhost/api/qr/qr-tok/checkin', 'POST', { conditionIn: 'Bon état', mileageIn: 10120, fuelIn: 60 }),
            { params: Promise.resolve({ token: 'qr-tok' }) },
        )],
        ['PATCH /api/incidents/[id]', () => patchIncident(jsonRequest('http://localhost/api/incidents/incident-1', 'PATCH', { status: 'SUBMITTED' }), byId('incident-1'))],
    ];

    beforeEach(async () => {
        asUser(['RESP_VEHICULE']);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, status: 'IN_USE', mileage: 10000 });
        await db.execute({ sql: `UPDATE "Vehicle" SET qrToken = 'qr-tok' WHERE id = 'VL001'`, args: [] });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', mileageOut: 10000 });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-driver', status: 'DRAFT' });
    });

    it.each(cases)('%s', async (_label, call) => {
        const res = await call();
        expect(res.status).not.toBe(403);
    });

    it('chacun de ces cas refuse un CADRE seul (403) — les appels atteignent bien la garde', async () => {
        asUser(['CADRE']);
        const refused: string[] = [];
        for (const [label, call] of cases) {
            if ((await call()).status === 403) refused.push(label);
        }
        expect(refused).toEqual(cases.map(([label]) => label));
    });
});
