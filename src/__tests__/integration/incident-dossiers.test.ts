/**
 * Tests d'intégration — dossier « Nouveau » créé automatiquement à l'envoi d'une
 * déclaration d'incident (POST /api/incidents, PATCH /api/incidents/[id]) et
 * statuts / motif de clôture des dossiers du suivi technique.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/push', () => ({
    sendPushNotification: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/r2', () => ({ deleteObject: vi.fn(async () => {}) }));
vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
    getRenaultVehicleData: vi.fn().mockResolvedValue(null),
    isConnectedInDb: vi.fn().mockResolvedValue(false),
}));

import { POST as postIncident } from '@/app/api/incidents/route';
import { PATCH as patchIncident } from '@/app/api/incidents/[id]/route';
import { POST as postTrip } from '@/app/api/trips/route';
import { GET as listDossiers } from '@/app/api/fleet-tracking/dossiers/route';
import { GET as getDossier, PATCH as patchDossier } from '@/app/api/fleet-tracking/dossiers/[id]/route';
import { auth } from '@/auth';
import { db, seedRoles, seedUniteLocale, seedUser, seedUserRole, seedVehicle } from './setup';
import { createIncidentDossier } from '@/lib/fleetTracking/incidentDossiers';

const mockedAuth = vi.mocked(auth);

const DRIVER = { user: { id: 'u-driver', email: 'driver@test.com', name: 'Jeanne Martin', ulId: 'ul-a', roles: ['CHVL'] } } as never;
const RESP = { user: { id: 'u-resp', email: 'resp@test.com', name: 'Camille Roux', ulId: 'ul-a', roles: ['RESP_VEHICULE'] } } as never;

const json = (method: string, url: string, body?: unknown) => new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

async function dossiers() {
    return (await db.execute(`SELECT * FROM "FleetDossier" ORDER BY createdAt`)).rows;
}

async function declare(body: Record<string, unknown>): Promise<string> {
    mockedAuth.mockResolvedValue(DRIVER);
    const res = await postIncident(json('POST', 'http://localhost/api/incidents', { vehicleId: 'veh-a', ...body }));
    expect(res.status).toBe(201);
    return (await res.json() as { id: string }).id;
}

beforeEach(async () => {
    vi.clearAllMocks();
    await seedUniteLocale({ id: 'ul-a', name: 'Paris 18', slug: 'paris-18' });
    await seedUser({ id: 'u-driver', email: 'driver@test.com', name: 'Jeanne Martin' });
    await seedUser({ id: 'u-resp', email: 'resp@test.com', name: 'Camille Roux' });
    await seedVehicle({ id: 'veh-a', name: 'VL186', plate: 'AA-111-AA', ulId: 'ul-a' });
});

describe('dossier automatique depuis une déclaration d\'incident', () => {
    it('accident envoyé directement : un dossier NEW « Accident — VL186 » avec sa source', async () => {
        const reportId = await declare({
            type: 'ACCIDENT', status: 'SUBMITTED', occurredAt: '2026-11-20T10:30:00.000Z',
            location: 'Rue de la Chapelle', description: 'Choc à l\'arrière',
        });
        const rows = await dossiers();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            status: 'NEW', title: 'Accident — VL186', ulId: 'ul-a', vehicleId: 'veh-a',
            sourceType: 'INCIDENT_REPORT', sourceId: reportId, pinned: 0,
        });
        expect(String(rows[0].description)).toContain('Jeanne Martin');
        expect(String(rows[0].description)).toContain('Rue de la Chapelle');
        expect(String(rows[0].description)).toContain('Choc à l\'arrière');
        const links = await db.execute({ sql: `SELECT vehicleId FROM "FleetDossierVehicle" WHERE dossierId = ?`, args: [String(rows[0].id)] });
        expect(links.rows.map(r => r.vehicleId)).toEqual(['veh-a']);
    });

    it('flash : brouillon sans dossier, puis passage à SUBMITTED : un dossier', async () => {
        const reportId = await declare({ type: 'FLASH', status: 'DRAFT' });
        expect(await dossiers()).toHaveLength(0);

        const res = await patchIncident(json('PATCH', `http://localhost/api/incidents/${reportId}`, { status: 'SUBMITTED' }), withId(reportId));
        expect(res.status).toBe(200);
        const rows = await dossiers();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ status: 'NEW', title: 'Avis de contravention (flash) — VL186', sourceId: reportId });
    });

    it('un brouillon modifié reste sans dossier', async () => {
        const reportId = await declare({ type: 'ACCIDENT', status: 'DRAFT' });
        await patchIncident(json('PATCH', `http://localhost/api/incidents/${reportId}`, { location: 'Paris', status: 'DRAFT' }), withId(reportId));
        expect(await dossiers()).toHaveLength(0);
    });

    it('un seul dossier par déclaration, même rappelé', async () => {
        const reportId = await declare({ type: 'ACCIDENT', status: 'SUBMITTED' });
        expect(await createIncidentDossier(reportId)).toBeNull();
        expect(await createIncidentDossier(reportId)).toBeNull();
        expect(await dossiers()).toHaveLength(1);
    });

    it('une déclaration inconnue ne crée rien', async () => {
        expect(await createIncidentDossier('inconnue')).toBeNull();
        expect(await dossiers()).toHaveLength(0);
    });

    it('un échec de création du dossier ne bloque pas la déclaration (201)', async () => {
        const spy = vi.spyOn(db, 'batch').mockRejectedValueOnce(new Error('boom'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const reportId = await declare({ type: 'ACCIDENT', status: 'SUBMITTED' });
        spy.mockRestore();
        errSpy.mockRestore();
        const report = await db.execute({ sql: `SELECT status FROM "IncidentReport" WHERE id = ?`, args: [reportId] });
        expect(report.rows[0].status).toBe('SUBMITTED');
        expect(await dossiers()).toHaveLength(0);
    });

    it('le carnet de bord (prise avec état dégradé) ne crée aucun dossier', async () => {
        await seedRoles(['CHVL']);
        await seedUserRole('u-driver', 'CHVL');
        mockedAuth.mockResolvedValue(DRIVER);
        const res = await postTrip(json('POST', 'http://localhost/api/trips', {
            vehicleId: 'veh-a', missionType: 'Logistique', conditionOut: 'Dégradé', dsaChecked: false,
        }));
        expect(res.status).toBe(201);
        expect(await dossiers()).toHaveLength(0);
    });
});

describe('statuts et motif de clôture', () => {
    async function newDossier(): Promise<string> {
        await declare({ type: 'ACCIDENT', status: 'SUBMITTED' });
        return String((await dossiers())[0].id);
    }

    it('clore sans motif : 400 en français, le dossier reste ouvert', async () => {
        const id = await newDossier();
        mockedAuth.mockResolvedValue(RESP);
        const res = await patchDossier(json('PATCH', `http://localhost/api/fleet-tracking/dossiers/${id}`, { status: 'CLOSED' }), withId(id));
        expect(res.status).toBe(400);
        expect(JSON.stringify(await res.json())).toContain('motif de clôture');
        expect((await dossiers())[0].status).toBe('NEW');
    });

    it('motif invalide : 400', async () => {
        const id = await newDossier();
        mockedAuth.mockResolvedValue(RESP);
        const res = await patchDossier(json('PATCH', `http://localhost/api/fleet-tracking/dossiers/${id}`, { status: 'CLOSED', closeReason: 'NOPE' }), withId(id));
        expect(res.status).toBe(400);
    });

    it('un motif sur un dossier qui n\'est pas clos : 400', async () => {
        const id = await newDossier();
        mockedAuth.mockResolvedValue(RESP);
        const res = await patchDossier(json('PATCH', `http://localhost/api/fleet-tracking/dossiers/${id}`, { closeReason: 'REPAIRED' }), withId(id));
        expect(res.status).toBe(400);
    });

    it('effacer le motif d\'un dossier clos (closeReason null sans statut) : 400', async () => {
        const id = await newDossier();
        mockedAuth.mockResolvedValue(RESP);
        const url = `http://localhost/api/fleet-tracking/dossiers/${id}`;
        await patchDossier(json('PATCH', url, { status: 'CLOSED', closeReason: 'REPAIRED' }), withId(id));
        const res = await patchDossier(json('PATCH', url, { closeReason: null }), withId(id));
        expect(res.status).toBe(400);
        expect((await dossiers())[0].closeReason).toBe('REPAIRED');
    });

    it('NEW → WAITING → CLOSED (assurance) → OPEN : motif et date de clôture posés puis effacés', async () => {
        const id = await newDossier();
        mockedAuth.mockResolvedValue(RESP);
        const url = `http://localhost/api/fleet-tracking/dossiers/${id}`;

        let res = await patchDossier(json('PATCH', url, { status: 'WAITING' }), withId(id));
        expect(res.status).toBe(200);
        expect((await dossiers())[0].status).toBe('WAITING');

        res = await patchDossier(json('PATCH', url, { status: 'CLOSED', closeReason: 'INSURANCE' }), withId(id));
        expect(res.status).toBe(200);
        let body = await res.json() as { dossier: { status: string; closeReason: string; closedAt: string; sourceType: string } };
        expect(body.dossier).toMatchObject({ status: 'CLOSED', closeReason: 'INSURANCE', sourceType: 'INCIDENT_REPORT' });
        expect(body.dossier.closedAt).toBeTruthy();

        res = await patchDossier(json('PATCH', url, { status: 'OPEN' }), withId(id));
        body = await res.json() as typeof body;
        expect(body.dossier).toMatchObject({ status: 'OPEN', closeReason: null, closedAt: null });
    });

    it('« Ouverts » = tout sauf clos ; « Clos » = clos seulement', async () => {
        const a = await newDossier();
        await declare({ type: 'FLASH', status: 'SUBMITTED' });
        mockedAuth.mockResolvedValue(RESP);
        const all = await dossiers();
        const b = String(all[1].id);
        await patchDossier(json('PATCH', `http://localhost/api/fleet-tracking/dossiers/${b}`, { status: 'WAITING' }), withId(b));
        await patchDossier(json('PATCH', `http://localhost/api/fleet-tracking/dossiers/${a}`, { status: 'CLOSED', closeReason: 'NO_ACTION' }), withId(a));

        const open = await (await listDossiers(json('GET', 'http://localhost/api/fleet-tracking/dossiers?status=OPEN'))).json() as { dossiers: { id: string }[] };
        expect(open.dossiers.map(d => d.id)).toEqual([b]);
        const closed = await (await listDossiers(json('GET', 'http://localhost/api/fleet-tracking/dossiers?status=CLOSED'))).json() as { dossiers: { id: string; closeReason: string }[] };
        expect(closed.dossiers.map(d => [d.id, d.closeReason])).toEqual([[a, 'NO_ACTION']]);
    });

    it('le détail expose la source du dossier', async () => {
        const id = await newDossier();
        mockedAuth.mockResolvedValue(RESP);
        const res = await getDossier(json('GET', `http://localhost/api/fleet-tracking/dossiers/${id}`), withId(id));
        const body = await res.json() as { dossier: { sourceType: string; sourceId: string } };
        expect(body.dossier.sourceType).toBe('INCIDENT_REPORT');
        expect(body.dossier.sourceId).toBeTruthy();
    });

    it('401 sans session et 403 pour un chauffeur', async () => {
        const id = await newDossier();
        mockedAuth.mockResolvedValue(null as never);
        expect((await patchDossier(json('PATCH', 'http://localhost/x', { status: 'WAITING' }), withId(id))).status).toBe(401);
        mockedAuth.mockResolvedValue(DRIVER);
        expect((await patchDossier(json('PATCH', 'http://localhost/x', { status: 'WAITING' }), withId(id))).status).toBe(403);
    });
});
