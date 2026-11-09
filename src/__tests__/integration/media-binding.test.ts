/**
 * Tests d'intégration — liaison référence ↔ enregistrement et suppression des
 * fichiers (revue 1).
 *
 *   - 400 sur une référence forgée, d'une autre UL ou déjà portée par un autre
 *     enregistrement : POST /api/trips, PATCH check-in, POST / PATCH /api/incidents ;
 *   - check-in : un id Drive résiduel est remplacé par le préfixe R2 reçu, un préfixe R2
 *     en place est conservé ;
 *   - suppression d'un trajet, des trajets d'un véhicule, d'un véhicule (trajets et
 *     incidents), d'un incident, d'un compte rendu : fichiers supprimés s'ils ne sont
 *     pas partagés ; un id Drive résiduel ne désigne aucun fichier (aucun appel) ;
 *   - PDF d'incident : photos lues depuis le préfixe R2, aucune pour un id Drive résiduel.
 * Base réelle ; R2 remplacé par un bucket en mémoire ; push et télémétrie mockés.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bucket = new Map<string, Buffer>();

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/push', () => ({
    sendPushNotification: vi.fn().mockResolvedValue(undefined),
    notifyRoles: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
    getRenaultVehicleData: vi.fn().mockResolvedValue(null),
    isConnectedInDb: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/r2', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/r2')>();
    return {
        ...actual,
        putObject: vi.fn(async (key: string, body: Buffer) => { bucket.set(key, body); }),
        getObject: vi.fn(async (key: string) => bucket.get(key) ?? null),
        deleteObject: vi.fn(async (key: string) => { bucket.delete(key); }),
        listObjects: vi.fn(async (prefix: string) => [...bucket.keys()].filter((k) => k.startsWith(prefix))),
        deletePrefix: vi.fn(async (prefix: string) => {
            let n = 0;
            for (const k of [...bucket.keys()]) if (k.startsWith(`${prefix}/`)) { bucket.delete(k); n++; }
            return n;
        }),
        deleteMediaKey: vi.fn(async (key: string) => { bucket.delete(key); }),
    };
});
const renderedPhotos: unknown[][] = [];
vi.mock('@react-pdf/renderer', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@react-pdf/renderer')>();
    return {
        ...actual,
        renderToBuffer: vi.fn(async (element: { props: { photos: unknown[] } }) => {
            renderedPhotos.push(element.props.photos);
            return Buffer.from('%PDF-fake');
        }),
    };
});

import { POST as POST_TRIP } from '@/app/api/trips/route';
import { PATCH as CHECKIN } from '@/app/api/trips/[id]/checkin/route';
import { DELETE as DELETE_TRIP } from '@/app/api/trips/[id]/route';
import { DELETE as DELETE_VEHICLE_TRIPS } from '@/app/api/vehicles/[id]/trips/route';
import { DELETE as DELETE_VEHICLE } from '@/app/api/vehicles/[id]/route';
import { POST as POST_INCIDENT } from '@/app/api/incidents/route';
import { PATCH as PATCH_INCIDENT, DELETE as DELETE_INCIDENT } from '@/app/api/incidents/[id]/route';
import { GET as INCIDENT_PDF } from '@/app/api/incidents/[id]/pdf/route';
import { DELETE as DELETE_MISSION } from '@/app/api/missions/[id]/route';
import { auth } from '@/auth';
import { deleteMediaKey, deletePrefix, listObjects } from '@/lib/r2';
import { db, seedVehicle, seedUser, seedTrip, seedIncident, seedUniteLocale } from './setup';

const mockedAuth = vi.mocked(auth);

const PARIS_TRIP = 'trip-photos/paris-18/vl186-20261108-143000-a1b2';
const PARIS_TRIP_2 = 'trip-photos/paris-18/vl186-20261108-150000-c3d4';
const LYON_TRIP = 'trip-photos/lyon-3/vl186-20261108-143000-a1b2';
const PARIS_INC = 'incident-photos/paris-18/vl186-20261108-143000-a1b2';

const driver = { user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } };
const admin = { user: { id: 'admin-id', email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } };

function json(url: string, method: string, body: Record<string, unknown>): Request {
    return new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function put(prefix: string, files: string[]) {
    for (const f of files) bucket.set(`${prefix}/${f}`, Buffer.from(f));
}

beforeEach(async () => {
    vi.clearAllMocks();
    bucket.clear();
    renderedPhotos.length = 0;
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-lyon-3', name: 'Lyon 3', slug: 'lyon-3' });
    await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedUser({ id: 'admin-id', email: 'admin@test.com' });
});

describe('POST /api/trips — dossier de photos d\'emprunt', () => {
    const body = (driveFolderId: string) => ({ vehicleId: 'VL001', missionType: 'Logistique', conditionOut: 'BON', dsaChecked: false, driveFolderId });

    it('201 avec un préfixe de l\'UL du véhicule', async () => {
        mockedAuth.mockResolvedValue(driver as never);
        const res = await POST_TRIP(json('http://localhost/api/trips', 'POST', body(PARIS_TRIP)));
        expect(res.status).toBe(201);
    });

    it.each([
        [LYON_TRIP, 'autre UL'],
        [PARIS_INC, 'type différent'],
        ['trip-photos/../x', 'clé forgée'],
        [`${PARIS_TRIP}/emprunt`, 'pas un dossier complet'],
    ])('400 : %s (%s)', async (ref) => {
        mockedAuth.mockResolvedValue(driver as never);
        const res = await POST_TRIP(json('http://localhost/api/trips', 'POST', body(ref)));
        expect(res.status).toBe(400);
    });

    it('400 : préfixe déjà porté par un autre trajet (référence d\'autrui)', async () => {
        await seedTrip({ id: 'trip-other', vehicleId: 'VL001', driverId: 'admin-id', checkInAt: '2026-11-01T10:00:00Z' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = 'trip-other'`, args: [PARIS_TRIP] });
        mockedAuth.mockResolvedValue(driver as never);
        const res = await POST_TRIP(json('http://localhost/api/trips', 'POST', body(PARIS_TRIP)));
        expect(res.status).toBe(400);
    });
});

describe('PATCH /api/trips/[id]/checkin — dossier de photos', () => {
    const checkin = (driveFolderId?: string) => CHECKIN(
        json('http://localhost/api/trips/trip-1/checkin', 'PATCH', { conditionIn: 'BON', mileageIn: 10120, fuelIn: 60, ...(driveFolderId ? { driveFolderId } : {}) }),
        ctx('trip-1'),
    );
    const folderOf = async () => (await db.execute(`SELECT driveFolderId FROM Trip WHERE id = 'trip-1'`)).rows[0].driveFolderId;

    beforeEach(async () => {
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', mileageOut: 10000 });
        await db.execute(`UPDATE Vehicle SET status = 'IN_USE', mileage = 10000 WHERE id = 'VL001'`);
        mockedAuth.mockResolvedValue(driver as never);
    });

    it('rendu d\'un trajet à id Drive résiduel : l\'id Drive est REMPLACÉ par le préfixe R2 reçu', async () => {
        await db.execute(`UPDATE Trip SET driveFolderId = 'drive-ancien' WHERE id = 'trip-1'`);
        const res = await checkin(PARIS_TRIP);
        expect(res.status).toBe(200);
        expect(await folderOf()).toBe(PARIS_TRIP);
    });

    it('un préfixe R2 déjà en place est conservé', async () => {
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = 'trip-1'`, args: [PARIS_TRIP] });
        expect((await checkin(PARIS_TRIP_2)).status).toBe(200);
        expect(await folderOf()).toBe(PARIS_TRIP);
    });

    it('trajet sans dossier : le préfixe reçu est enregistré', async () => {
        expect((await checkin(PARIS_TRIP)).status).toBe(200);
        expect(await folderOf()).toBe(PARIS_TRIP);
    });

    it('400 : préfixe d\'une autre UL ou d\'un autre trajet, rien n\'est enregistré', async () => {
        expect((await checkin(LYON_TRIP)).status).toBe(400);
        await seedTrip({ id: 'trip-other', vehicleId: 'VL001', driverId: 'admin-id', checkInAt: '2026-11-01T10:00:00Z' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = 'trip-other'`, args: [PARIS_TRIP_2] });
        expect((await checkin(PARIS_TRIP_2)).status).toBe(400);
        expect(await folderOf()).toBeNull();
    });
});

describe('POST / PATCH /api/incidents — dossier de photos', () => {
    it('POST : 201 pour un préfixe de l\'UL du véhicule, 400 pour un préfixe d\'une autre UL', async () => {
        mockedAuth.mockResolvedValue(driver as never);
        const ok = await POST_INCIDENT(json('http://localhost/api/incidents', 'POST', { vehicleId: 'VL001', driveFolderId: PARIS_INC }));
        expect(ok.status).toBe(201);
        const ko = await POST_INCIDENT(json('http://localhost/api/incidents', 'POST', { vehicleId: 'VL001', driveFolderId: 'incident-photos/lyon-3/x-20261108-143000-a1b2' }));
        expect(ko.status).toBe(400);
    });

    it('PATCH : 400 pour la référence d\'un autre incident, 200 pour la sienne', async () => {
        await seedIncident({ id: 'inc-1', vehicleId: 'VL001', userId: 'user-driver' });
        await seedIncident({ id: 'inc-2', vehicleId: 'VL001', userId: 'admin-id' });
        await db.execute({ sql: `UPDATE IncidentReport SET driveFolderId = ? WHERE id = 'inc-2'`, args: [PARIS_INC] });
        mockedAuth.mockResolvedValue(driver as never);
        const ko = await PATCH_INCIDENT(json('http://localhost/api/incidents/inc-1', 'PATCH', { driveFolderId: PARIS_INC }), ctx('inc-1'));
        expect(ko.status).toBe(400);
        const own = 'incident-photos/paris-18/vl186-20261108-160000-ffff';
        expect((await PATCH_INCIDENT(json('http://localhost/api/incidents/inc-1', 'PATCH', { driveFolderId: own }), ctx('inc-1'))).status).toBe(200);
        expect((await PATCH_INCIDENT(json('http://localhost/api/incidents/inc-1', 'PATCH', { driveFolderId: own }), ctx('inc-1'))).status).toBe(200);
    });
});

describe('PATCH /api/incidents/[id] — dossier remplacé', () => {
    it('l\'ancien dossier est supprimé s\'il n\'est plus référencé', async () => {
        await seedIncident({ id: 'inc-1', vehicleId: 'VL001', userId: 'user-driver' });
        await db.execute({ sql: `UPDATE IncidentReport SET driveFolderId = ? WHERE id = 'inc-1'`, args: [PARIS_INC] });
        put(PARIS_INC, ['0a1b2c3d-a.jpg']);
        mockedAuth.mockResolvedValue(driver as never);
        const next = 'incident-photos/paris-18/vl186-20261108-160000-ffff';
        expect((await PATCH_INCIDENT(json('http://localhost/api/incidents/inc-1', 'PATCH', { driveFolderId: next }), ctx('inc-1'))).status).toBe(200);
        expect(vi.mocked(deletePrefix)).toHaveBeenCalledWith(PARIS_INC);
        expect(bucket.size).toBe(0);
    });

    it('même dossier renvoyé : rien n\'est supprimé', async () => {
        await seedIncident({ id: 'inc-1', vehicleId: 'VL001', userId: 'user-driver' });
        await db.execute({ sql: `UPDATE IncidentReport SET driveFolderId = ? WHERE id = 'inc-1'`, args: [PARIS_INC] });
        mockedAuth.mockResolvedValue(driver as never);
        await PATCH_INCIDENT(json('http://localhost/api/incidents/inc-1', 'PATCH', { driveFolderId: PARIS_INC }), ctx('inc-1'));
        await PATCH_INCIDENT(json('http://localhost/api/incidents/inc-1', 'PATCH', { description: 'x' }), ctx('inc-1'));
        expect(vi.mocked(deletePrefix)).not.toHaveBeenCalled();
    });
});

describe('insertMissionReport — dossier rangé sous l\'UL de la session', () => {
    it('accepté quand l\'envoi est retombé sur l\'UL de la session (ni membre de l\'UL choisie, ni UL de rattachement)', async () => {
        const { createMissionReportSchema, insertMissionReport } = await import('@/lib/missions/create-mission-report');
        const data = createMissionReportSchema.parse({
            selected_ul_id: 'ul-paris-18', selected_dt_code: null, mission_type: 'RESEAU', mission_name: 'Maraude',
            mission_date: '2026-11-08', location: 'Paris', volunteers: 'Moi', pegass_ok: true, victim_count: 0,
            had_acr: false, had_hemorrhage: false, had_complex_care: false, needs_followup: false,
            supplies: [], intervention_types: [], intervention_natures: [],
            drive_folder_id: 'mission-com-photos/lyon-3/maraude-20261108-143000-a1b2',
        });
        const refused = await insertMissionReport(data, 'admin@test.com', 'admin-id');
        expect(refused).toMatchObject({ ok: false, status: 400 });
        const accepted = await insertMissionReport(data, 'admin@test.com', 'admin-id', 'ul-lyon-3');
        expect(accepted.ok).toBe(true);
        const defaultSession = await insertMissionReport({ ...data, drive_folder_id: 'mission-com-photos/lyon-3/autre-20261108-143000-b2c3' }, 'admin@test.com', 'admin-id', 'default');
        expect(defaultSession).toMatchObject({ ok: false, status: 400 });
    });
});

describe('Suppressions — fichiers supprimés s\'ils ne sont pas partagés', () => {
    it('DELETE /api/trips/[id] : préfixe R2 supprimé', async () => {
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', checkInAt: '2026-11-01T10:00:00Z' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = 'trip-1'`, args: [PARIS_TRIP] });
        put(PARIS_TRIP, ['emprunt/0a1b2c3d-a.jpg', 'rendu/0a1b2c3d-b.jpg']);
        mockedAuth.mockResolvedValue(admin as never);
        expect((await DELETE_TRIP(new Request('http://localhost/api/trips/trip-1', { method: 'DELETE' }), ctx('trip-1'))).status).toBe(200);
        expect(vi.mocked(deletePrefix)).toHaveBeenCalledWith(PARIS_TRIP);
        expect(bucket.size).toBe(0);
    });

    it('DELETE /api/trips/[id] : dossier partagé avec un autre trajet → conservé', async () => {
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', checkInAt: '2026-11-01T10:00:00Z' });
        await seedTrip({ id: 'trip-2', vehicleId: 'VL001', driverId: 'user-driver', checkInAt: '2026-11-02T10:00:00Z' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id IN ('trip-1', 'trip-2')`, args: [PARIS_TRIP] });
        mockedAuth.mockResolvedValue(admin as never);
        await DELETE_TRIP(new Request('http://localhost/api/trips/trip-1', { method: 'DELETE' }), ctx('trip-1'));
        expect(vi.mocked(deletePrefix)).not.toHaveBeenCalled();
    });

    it('DELETE /api/trips/[id] : id Drive résiduel → trajet supprimé, aucun appel de stockage', async () => {
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', checkInAt: '2026-11-01T10:00:00Z' });
        await db.execute(`UPDATE Trip SET driveFolderId = '1AbCdrive' WHERE id = 'trip-1'`);
        mockedAuth.mockResolvedValue(admin as never);
        expect((await DELETE_TRIP(new Request('http://localhost/api/trips/trip-1', { method: 'DELETE' }), ctx('trip-1'))).status).toBe(200);
        expect((await db.execute(`SELECT 1 FROM Trip WHERE id = 'trip-1'`)).rows).toHaveLength(0);
        expect(vi.mocked(deletePrefix)).not.toHaveBeenCalled();
        expect(vi.mocked(deleteMediaKey)).not.toHaveBeenCalled();
    });

    it('DELETE /api/vehicles/[id] : ids Drive résiduels (trajet, incident) → véhicule supprimé, aucun appel', async () => {
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', checkInAt: '2026-11-01T10:00:00Z' });
        await db.execute(`UPDATE Trip SET driveFolderId = '1AbCdrive' WHERE id = 'trip-1'`);
        await seedIncident({ id: 'inc-1', vehicleId: 'VL001', userId: 'user-driver' });
        await db.execute(`UPDATE IncidentReport SET driveFolderId = '1XyZdrive' WHERE id = 'inc-1'`);
        mockedAuth.mockResolvedValue(admin as never);
        expect((await DELETE_VEHICLE(new Request('http://localhost/api/vehicles/VL186', { method: 'DELETE' }), ctx('VL186'))).status).toBe(200);
        expect((await db.execute(`SELECT 1 FROM Vehicle WHERE id = 'VL001'`)).rows).toHaveLength(0);
        expect(vi.mocked(deletePrefix)).not.toHaveBeenCalled();
    });

    it('DELETE /api/missions/[id] : ids Drive résiduels → compte rendu supprimé, aucun appel', async () => {
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, ulId, drive_folder_id, signed_report_drive_id)
                  VALUES ('mr-d', 'admin-id', '2026-10-01T10:00:00Z', 'DPS', 'DPS', '2026-10-01', 'Paris', '[]', 'ul-paris-18', '1AbCdrive', '1XyZdriveFile')`,
            args: [],
        });
        mockedAuth.mockResolvedValue(admin as never);
        expect((await DELETE_MISSION(new Request('http://localhost/api/missions/mr-d', { method: 'DELETE' }), ctx('mr-d'))).status).toBe(200);
        expect((await db.execute(`SELECT 1 FROM "mission_reports" WHERE id = 'mr-d'`)).rows).toHaveLength(0);
        expect(vi.mocked(deletePrefix)).not.toHaveBeenCalled();
        expect(vi.mocked(deleteMediaKey)).not.toHaveBeenCalled();
    });

    it('DELETE /api/vehicles/[id]/trips : préfixes des trajets supprimés', async () => {
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', checkInAt: '2026-11-01T10:00:00Z' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = 'trip-1'`, args: [PARIS_TRIP] });
        mockedAuth.mockResolvedValue(admin as never);
        expect((await DELETE_VEHICLE_TRIPS(new Request('http://localhost/api/vehicles/VL001/trips', { method: 'DELETE' }), ctx('VL001'))).status).toBe(200);
        expect(vi.mocked(deletePrefix)).toHaveBeenCalledWith(PARIS_TRIP);
    });

    it('DELETE /api/vehicles/[id] : photos des trajets ET des incidents du véhicule', async () => {
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', checkInAt: '2026-11-01T10:00:00Z' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = 'trip-1'`, args: [PARIS_TRIP] });
        await seedIncident({ id: 'inc-1', vehicleId: 'VL001', userId: 'user-driver' });
        await db.execute({ sql: `UPDATE IncidentReport SET driveFolderId = ? WHERE id = 'inc-1'`, args: [PARIS_INC] });
        mockedAuth.mockResolvedValue(admin as never);
        expect((await DELETE_VEHICLE(new Request('http://localhost/api/vehicles/VL186', { method: 'DELETE' }), ctx('VL186'))).status).toBe(200);
        expect(vi.mocked(deletePrefix)).toHaveBeenCalledWith(PARIS_TRIP);
        expect(vi.mocked(deletePrefix)).toHaveBeenCalledWith(PARIS_INC);
    });

    it('DELETE /api/incidents/[id] : préfixe supprimé ; partagé → conservé', async () => {
        await seedIncident({ id: 'inc-1', vehicleId: 'VL001', userId: 'user-driver' });
        await seedIncident({ id: 'inc-2', vehicleId: 'VL001', userId: 'user-driver' });
        await seedIncident({ id: 'inc-3', vehicleId: 'VL001', userId: 'user-driver' });
        await db.execute({ sql: `UPDATE IncidentReport SET driveFolderId = ? WHERE id = 'inc-1'`, args: [PARIS_INC] });
        await db.execute({ sql: `UPDATE IncidentReport SET driveFolderId = 'drive-partage' WHERE id IN ('inc-2', 'inc-3')`, args: [] });
        mockedAuth.mockResolvedValue(driver as never);
        expect((await DELETE_INCIDENT(new Request('http://localhost/api/incidents/inc-1', { method: 'DELETE' }), ctx('inc-1'))).status).toBe(200);
        expect(vi.mocked(deletePrefix)).toHaveBeenCalledWith(PARIS_INC);
        // Id Drive résiduel (partagé ou non) : enregistrements supprimés, aucun appel de stockage.
        vi.mocked(deletePrefix).mockClear();
        expect((await DELETE_INCIDENT(new Request('http://localhost/api/incidents/inc-2', { method: 'DELETE' }), ctx('inc-2'))).status).toBe(200);
        expect((await DELETE_INCIDENT(new Request('http://localhost/api/incidents/inc-3', { method: 'DELETE' }), ctx('inc-3'))).status).toBe(200);
        expect(vi.mocked(deletePrefix)).not.toHaveBeenCalled();
    });

    it('DELETE /api/missions/[id] : photos (préfixe) et rapport signé (clé) supprimés', async () => {
        const com = 'mission-com-photos/paris-18/dps-20261108-143000-a1b2';
        const signed = 'mission-report-photo/paris-18/dps-20261108-143000-c3d4/0a1b2c3d-rapport.pdf';
        put(com, ['0a1b2c3d-a.jpg']);
        bucket.set(signed, Buffer.from('%PDF'));
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, ulId, drive_folder_id, signed_report_drive_id)
                  VALUES ('mr-1', 'admin-id', '2026-10-01T10:00:00Z', 'DPS', 'DPS', '2026-10-01', 'Paris', '[]', 'ul-paris-18', ?, ?)`,
            args: [com, signed],
        });
        mockedAuth.mockResolvedValue(admin as never);
        expect((await DELETE_MISSION(new Request('http://localhost/api/missions/mr-1', { method: 'DELETE' }), ctx('mr-1'))).status).toBe(200);
        expect(vi.mocked(deletePrefix)).toHaveBeenCalledWith(com);
        expect(bucket.size).toBe(0);
    });
});

describe('GET /api/incidents/[id]/pdf — photos R2', () => {
    it('les images du préfixe R2 sont intégrées au PDF (hors PDF et clés étrangères)', async () => {
        await seedIncident({ id: 'inc-1', vehicleId: 'VL001', userId: 'user-driver', status: 'SUBMITTED' });
        await db.execute({ sql: `UPDATE IncidentReport SET driveFolderId = ? WHERE id = 'inc-1'`, args: [PARIS_INC] });
        put(PARIS_INC, ['0a1b2c3d-a.jpg', '0a1b2c3d-b.png']);
        bucket.set('incident-photos/paris-18/autre/0a1b2c3d-x.jpg', Buffer.from('x'));
        mockedAuth.mockResolvedValue(driver as never);
        const res = await INCIDENT_PDF(new Request('http://localhost/api/incidents/inc-1/pdf'), ctx('inc-1'));
        expect(res.status).toBe(200);
        expect(renderedPhotos[0]).toEqual([
            `data:image/jpeg;base64,${Buffer.from('0a1b2c3d-a.jpg').toString('base64')}`,
            `data:image/png;base64,${Buffer.from('0a1b2c3d-b.png').toString('base64')}`,
        ]);
    });

    it('id Drive résiduel : PDF généré sans photo, aucun appel de stockage', async () => {
        await seedIncident({ id: 'inc-1', vehicleId: 'VL001', userId: 'user-driver', status: 'SUBMITTED' });
        await db.execute(`UPDATE IncidentReport SET driveFolderId = '1AbCdrive' WHERE id = 'inc-1'`);
        mockedAuth.mockResolvedValue(driver as never);
        const res = await INCIDENT_PDF(new Request('http://localhost/api/incidents/inc-1/pdf'), ctx('inc-1'));
        expect(res.status).toBe(200);
        expect(renderedPhotos[0]).toEqual([]);
        expect(vi.mocked(listObjects)).not.toHaveBeenCalled();
    });
});
