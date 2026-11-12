/**
 * Tests d'intégration — POST /api/media/upload, GET /api/media/photos, GET /api/media/file.
 * Base réelle ; R2 remplacé par un bucket en mémoire (les fonctions pures de
 * `@/lib/r2`, dont `expenseUlSegment`, restent les vraies).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bucket = new Map<string, { body: Buffer; contentType: string }>();

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/r2', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/r2')>();
    return {
        ...actual,
        putObject: vi.fn(async (key: string, body: Buffer, contentType = 'application/pdf') => { bucket.set(key, { body, contentType }); }),
        getObject: vi.fn(async (key: string) => bucket.get(key)?.body ?? null),
        deleteObject: vi.fn(async (key: string) => { bucket.delete(key); }),
        listObjects: vi.fn(async (prefix: string) => [...bucket.keys()].filter((k) => k.startsWith(prefix))),
        deletePrefix: vi.fn(async (prefix: string) => {
            let n = 0;
            for (const k of [...bucket.keys()]) if (k.startsWith(`${prefix}/`)) { bucket.delete(k); n++; }
            return n;
        }),
    };
});

import { POST as UPLOAD } from '@/app/api/media/upload/route';
import { GET as PHOTOS } from '@/app/api/media/photos/route';
import { GET as FILE } from '@/app/api/media/file/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser, seedTrip, seedUniteLocale, seedUserUL } from './setup';

const mockedAuth = vi.mocked(auth);

function session(overrides: Record<string, unknown> = {}) {
    return { user: { id: 'user-1', email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18', ...overrides } } as never;
}

function upload(fields: Record<string, string>, files: File[] = [new File(['jpeg'], 'IMG 1.JPG', { type: 'image/jpeg' })]): Promise<Response> {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    for (const f of files) fd.append('files', f);
    // Requête minimale (même motif que upload-validation) : l'analyse multipart du
    // Request de l'environnement de test n'est pas fiable.
    return UPLOAD({ formData: async () => fd, headers: new Headers(), method: 'POST', url: 'http://localhost/api/media/upload' } as unknown as Request);
}

beforeEach(async () => {
    vi.clearAllMocks();
    bucket.clear();
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-lyon-3', name: 'Lyon 3', slug: 'lyon-3' });
    await seedVehicle({ id: 'veh-1', name: 'VSAV 1', ulId: 'ul-paris-18' });
});

describe('POST /api/media/upload', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' });
        expect(res.status).toBe(401);
    });

    it('403 pour un compte inactif', async () => {
        mockedAuth.mockResolvedValue(session({ roles: ['INACTIF'] }));
        const res = await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' });
        expect(res.status).toBe(403);
    });

    it('403 pour un véhicule d\'une autre UL', async () => {
        mockedAuth.mockResolvedValue(session({ ulId: 'ul-lyon-3' }));
        const res = await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' });
        expect(res.status).toBe(403);
        expect(bucket.size).toBe(0);
    });

    it.each([
        [{ type: 'inconnu', vehicleId: 'veh-1' }, 'type inconnu'],
        [{ type: 'trip-photos', vehicleId: 'veh-1' }, 'étape manquante'],
        [{ type: 'trip-photos', vehicleId: 'veh-1', stage: 'incident' }, 'étape inconnue'],
        [{ type: 'incident-photos', vehicleId: 'veh-1', stage: 'emprunt' }, 'étape hors trajet'],
        [{ type: 'trip-photos', stage: 'emprunt' }, 'véhicule manquant'],
        [{ type: 'mission-com-photos' }, 'nom de mission manquant'],
    ])('400 (Zod) : %o — %s', async (fields: Record<string, string>, _label: string) => {
        mockedAuth.mockResolvedValue(session());
        void _label;
        const res = await upload(fields);
        expect(res.status).toBe(400);
    });

    it.each([['ADMIN'], ['RESP_VEHICULE']])('403 pour des photos d\'emprunt d\'un %s sans CHVL/CHVPSP (plus de dispense gestionnaire)', async (role) => {
        mockedAuth.mockResolvedValue(session({ roles: [role] }));
        const res = await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' });
        expect(res.status).toBe(403);
    });
    it('200 pour des photos d\'emprunt d\'un ADMIN qui porte aussi CHVL', async () => {
        mockedAuth.mockResolvedValue(session({ roles: ['ADMIN', 'CHVL'] }));
        const res = await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' });
        expect(res.status).toBe(200);
    });
    it('400 sans fichier, fichier trop gros, ou type refusé', async () => {
        mockedAuth.mockResolvedValue(session());
        expect((await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' }, [])).status).toBe(400);

        const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
        Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 });
        expect((await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' }, [big])).status).toBe(400);

        const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });
        expect((await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' }, [pdf])).status).toBe(400);
    });

    it('emprunt : dossier trip-photos/{slug}/{véhicule}-{horodatage}-{xxxx}/emprunt/ construit côté serveur', async () => {
        mockedAuth.mockResolvedValue(session());
        const res = await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt', name: 'ignoré' });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.folderId).toMatch(/^trip-photos\/paris-18\/vsav-1-\d{8}-\d{6}-[0-9a-f]{4}$/);
        expect(body.subfolderId).toBe(`${body.folderId}/emprunt`);
        expect(body.fileIds).toHaveLength(1);
        expect(body.fileIds[0]).toMatch(new RegExp(`^${body.folderId}/emprunt/[0-9a-f]{8}-img-1\\.jpg$`));
        expect(bucket.get(body.fileIds[0])?.contentType).toBe('image/jpeg');
    });

    it('rendu : réutilise le préfixe du trajet ; 403 si le préfixe est inaccessible', async () => {
        mockedAuth.mockResolvedValue(session());
        const first = await (await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' })).json();
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'veh-1', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: [first.folderId, 'trip-1'] });

        const res = await upload({ type: 'trip-photos', tripId: 'trip-1', stage: 'rendu', existingFolderId: first.folderId });
        const body = await res.json();
        expect(body.folderId).toBe(first.folderId);
        expect(body.fileIds[0]).toContain(`${first.folderId}/rendu/`);

        // Utilisateur d'une autre UL avec un véhicule de son UL : le préfixe reste refusé.
        await seedVehicle({ id: 'veh-2', name: 'VL Lyon', ulId: 'ul-lyon-3' });
        mockedAuth.mockResolvedValue(session({ ulId: 'ul-lyon-3' }));
        const denied = await upload({ type: 'trip-photos', vehicleId: 'veh-2', stage: 'rendu', existingFolderId: first.folderId });
        expect(denied.status).toBe(403);
    });

    it('dossier rattaché à un autre enregistrement : 403 même avec le droit de le lire (SUPER_ADMIN excepté)', async () => {
        mockedAuth.mockResolvedValue(session());
        const first = await (await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' })).json();
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'veh-1', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: [first.folderId, 'trip-1'] });

        // Même UL (lecture autorisée), mais sans passer par le trajet propriétaire.
        mockedAuth.mockResolvedValue(session({ id: 'autre' }));
        const denied = await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'rendu', existingFolderId: first.folderId });
        expect(denied.status).toBe(403);

        // Plus de dispense gestionnaire à l'emprunt : le SUPER_ADMIN doit aussi porter CHVL.
        mockedAuth.mockResolvedValue(session({ roles: ['SUPER_ADMIN', 'CHVL'] }));
        expect((await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'rendu', existingFolderId: first.folderId })).status).toBe(200);
    });

    it('type de fichier non servi (SVG, JFIF, icône) : 400', async () => {
        mockedAuth.mockResolvedValue(session());
        for (const type of ['image/svg+xml', 'image/pjpeg', 'image/x-icon']) {
            const res = await upload({ type: 'incident-photos', vehicleId: 'veh-1' }, [new File(['x'], 'f', { type })]);
            expect(res.status, type).toBe(400);
        }
        expect(bucket.size).toBe(0);
    });

    it('préfixe non rattaché : accepté s\'il existe déjà dans l\'UL (lot suivant), refusé s\'il est inventé', async () => {
        mockedAuth.mockResolvedValue(session());
        const first = await (await upload({ type: 'mission-com-photos', name: 'Maraude' })).json();
        const next = await upload({ type: 'mission-com-photos', name: 'Maraude', existingFolderId: first.folderId });
        expect(next.status).toBe(200);
        expect((await next.json()).folderId).toBe(first.folderId);

        const forged = await upload({ type: 'mission-com-photos', name: 'Maraude', existingFolderId: 'mission-com-photos/paris-18/invente-20261108-143000-0000' });
        expect(forged.status).toBe(403);
    });

    it('400 pour un préfixe existant forgé (../, type différent)', async () => {
        mockedAuth.mockResolvedValue(session());
        expect((await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'rendu', existingFolderId: 'trip-photos/../x' })).status).toBe(400);
        expect((await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'rendu', existingFolderId: 'incident-photos/paris-18/x' })).status).toBe(400);
    });

    it('mission : ulId retenu si l\'utilisateur en est membre ; rapport signé PDF accepté', async () => {
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedUserUL({ userId: 'user-1', ulId: 'ul-paris-18', isHome: true });
        await seedUserUL({ userId: 'user-1', ulId: 'ul-lyon-3', isHome: false });
        mockedAuth.mockResolvedValue(session());
        const pdf = new File(['%PDF'], 'Rapport.pdf', { type: 'application/pdf' });
        const signed = await (await upload({ type: 'mission-report-photo', name: 'DPS Marathon', ulId: 'ul-lyon-3' }, [pdf])).json();
        expect(signed.folderId).toMatch(/^mission-report-photo\/lyon-3\/dps-marathon-/);
        expect(signed.fileIds[0]).toMatch(/\/[0-9a-f]{8}-rapport\.pdf$/);

        const photos = await (await upload({ type: 'mission-com-photos', name: 'DPS Marathon', ulId: 'ul-inexistante' })).json();
        expect(photos.folderId).toMatch(/^mission-com-photos\/paris-18\/dps-marathon-/);
    });

    it('mission UL étrangère : rangé sous l\'UL de rattachement de l\'utilisateur', async () => {
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedUserUL({ userId: 'user-1', ulId: 'ul-paris-18', isHome: true });
        mockedAuth.mockResolvedValue(session());
        const res = await (await upload({ type: 'mission-com-photos', name: 'Maraude', ulId: 'ul-lyon-3' })).json();
        expect(res.folderId).toMatch(/^mission-com-photos\/paris-18\/maraude-/);
    });

    it('mission DT, session « default » : repli sur l\'UL de rattachement', async () => {
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedUserUL({ userId: 'user-1', ulId: 'ul-lyon-3', isHome: true });
        mockedAuth.mockResolvedValue(session({ ulId: 'default' }));
        const res = await upload({ type: 'mission-com-photos', name: 'DPS DT' });
        expect(res.status).toBe(200);
        expect((await res.json()).folderId).toMatch(/^mission-com-photos\/lyon-3\/dps-dt-/);
    });

    it('mission : SUPER_ADMIN peut ranger sous une UL dont il n\'est pas membre', async () => {
        mockedAuth.mockResolvedValue(session({ roles: ['SUPER_ADMIN'] }));
        const res = await (await upload({ type: 'mission-com-photos', name: 'Maraude', ulId: 'ul-lyon-3' })).json();
        expect(res.folderId).toMatch(/^mission-com-photos\/lyon-3\//);
    });

    it('mission : 403 pour verser dans le dossier d\'un compte rendu existant (hors super admin)', async () => {
        mockedAuth.mockResolvedValue(session({ roles: ['ADMIN'] }));
        const first = await (await upload({ type: 'mission-com-photos', name: 'Maraude' })).json();
        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, ulId, drive_folder_id)
                  VALUES ('mr-1', 'user-1', '2026-10-01T10:00:00Z', 'DPS', 'Maraude', '2026-10-01', 'Paris', '[]', 'ul-paris-18', ?)`,
            args: [first.folderId],
        });
        const res = await upload({ type: 'mission-com-photos', name: 'Maraude', existingFolderId: first.folderId });
        expect(res.status).toBe(403);
    });
});

describe('POST /api/media/upload — droits d\'envoi inter-UL (revue 1)', () => {
    async function seedLyonTrip(driveFolderId: string | null = null) {
        await seedUser({ id: 'driver-lyon', email: 'driver@lyon.test' });
        await seedUser({ id: 'other', email: 'other@test.com' });
        await seedTrip({ id: 'trip-x', vehicleId: 'veh-1', driverId: 'driver-lyon' });
        if (driveFolderId) await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: [driveFolderId, 'trip-x'] });
    }

    it('rendu inter-UL : le conducteur d\'une autre UL envoie avec tripId (200)', async () => {
        await seedLyonTrip();
        mockedAuth.mockResolvedValue(session({ id: 'driver-lyon', ulId: 'ul-lyon-3' }));
        const res = await upload({ type: 'trip-photos', tripId: 'trip-x', stage: 'rendu' });
        expect(res.status).toBe(200);
        expect((await res.json()).folderId).toMatch(/^trip-photos\/paris-18\/vsav-1-/);
    });

    it('rendu : un autre utilisateur hors UL est refusé (403), le gestionnaire de l\'UL accepté', async () => {
        await seedLyonTrip();
        mockedAuth.mockResolvedValue(session({ id: 'other', ulId: 'ul-lyon-3', roles: ['CHVL'] }));
        expect((await upload({ type: 'trip-photos', tripId: 'trip-x', stage: 'rendu' })).status).toBe(403);
        mockedAuth.mockResolvedValue(session({ id: 'other', ulId: 'ul-lyon-3', roles: ['ADMIN'] }));
        expect((await upload({ type: 'trip-photos', tripId: 'trip-x', stage: 'rendu' })).status).toBe(403);
        mockedAuth.mockResolvedValue(session({ id: 'other', ulId: 'ul-paris-18', roles: ['RESP_VEHICULE'] }));
        expect((await upload({ type: 'trip-photos', tripId: 'trip-x', stage: 'rendu' })).status).toBe(200);
    });

    it('rendu : 404 pour un trajet inconnu, 400 si le véhicule ne correspond pas', async () => {
        await seedLyonTrip();
        await seedVehicle({ id: 'veh-2', name: 'VL 2', ulId: 'ul-paris-18' });
        mockedAuth.mockResolvedValue(session({ id: 'driver-lyon' }));
        expect((await upload({ type: 'trip-photos', tripId: 'inconnu', stage: 'rendu' })).status).toBe(404);
        expect((await upload({ type: 'trip-photos', tripId: 'trip-x', vehicleId: 'veh-2', stage: 'rendu' })).status).toBe(400);
    });

    it('rendu sans dossier fourni : réutilise le préfixe R2 du trajet', async () => {
        const ref = 'trip-photos/paris-18/vsav-1-20261108-143000-a1b2';
        await seedLyonTrip(ref);
        mockedAuth.mockResolvedValue(session({ id: 'driver-lyon', ulId: 'ul-lyon-3' }));
        const body = await (await upload({ type: 'trip-photos', tripId: 'trip-x', stage: 'rendu' })).json();
        expect(body.folderId).toBe(ref);
    });

    it('existingFolderId périmé (ancien id Drive) : le préfixe R2 du trajet l\'emporte', async () => {
        const ref = 'trip-photos/paris-18/vsav-1-20261108-143000-a1b2';
        await seedLyonTrip(ref);
        mockedAuth.mockResolvedValue(session({ id: 'driver-lyon', ulId: 'ul-lyon-3' }));
        const res = await upload({ type: 'trip-photos', tripId: 'trip-x', stage: 'rendu', existingFolderId: 'drive-perime' });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.folderId).toBe(ref);
        expect(body.fileIds[0]).toContain(`${ref}/rendu/`);
    });

    it('emprunt : refusé sans rôle de conduite du véhicule', async () => {
        mockedAuth.mockResolvedValue(session({ roles: ['CI/RPAPS'] }));
        expect((await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' })).status).toBe(403);
    });

    it('incident QR hors UL : tout compte actif connecté (200) ; INACTIF → 403', async () => {
        mockedAuth.mockResolvedValue(session({ ulId: 'ul-lyon-3', roles: ['CI/RPAPS'] }));
        const res = await upload({ type: 'incident-photos', vehicleId: 'veh-1' });
        expect(res.status).toBe(200);
        expect((await res.json()).folderId).toMatch(/^incident-photos\/paris-18\/vsav-1-/);
        mockedAuth.mockResolvedValue(session({ ulId: 'ul-lyon-3', roles: ['CHVL', 'INACTIF'] }));
        expect((await upload({ type: 'incident-photos', vehicleId: 'veh-1' })).status).toBe(403);
    });

    it('extension repliée sur le type MIME (fichier sans extension)', async () => {
        mockedAuth.mockResolvedValue(session());
        const body = await (await upload({ type: 'incident-photos', vehicleId: 'veh-1' }, [new File(['x'], 'photo', { type: 'image/png' })])).json();
        expect(body.fileIds[0]).toMatch(/-photo\.png$/);
    });
});

describe('POST /api/media/upload — rendu d\'un trajet à id Drive résiduel', () => {
    beforeEach(async () => {
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedTrip({ id: 'trip-d', vehicleId: 'veh-1', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = 'drv-folder' WHERE id = 'trip-d'`, args: [] });
    });

    it('nouveau préfixe R2 : seules les photos du rendu y sont écrites', async () => {
        mockedAuth.mockResolvedValue(session());
        const res = await upload({ type: 'trip-photos', tripId: 'trip-d', stage: 'rendu', existingFolderId: 'drv-folder' },
            [new File(['r1'], 'r1.jpg', { type: 'image/jpeg' }), new File(['r2'], 'r2.jpg', { type: 'image/jpeg' })]);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.folderId).toMatch(/^trip-photos\/paris-18\/vsav-1-/);
        const keys = [...bucket.keys()];
        expect(keys).toHaveLength(2);
        expect(keys.every((k) => k.startsWith(`${body.folderId}/rendu/`))).toBe(true);
    });

    it('sans existingFolderId : l\'id Drive du trajet est ignoré, nouveau préfixe', async () => {
        mockedAuth.mockResolvedValue(session());
        const res = await upload({ type: 'trip-photos', tripId: 'trip-d', stage: 'rendu' });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.folderId).toMatch(/^trip-photos\/paris-18\/vsav-1-/);
    });
});

describe('GET /api/media/photos et /api/media/file', () => {
    async function seedTripWithPhotos(): Promise<{ ref: string; keys: string[] }> {
        mockedAuth.mockResolvedValue(session());
        const first = await (await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'emprunt' })).json();
        const second = await (await upload({ type: 'trip-photos', vehicleId: 'veh-1', stage: 'rendu', existingFolderId: first.folderId })).json();
        await seedUser({ id: 'user-1', email: 'user@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'veh-1', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE Trip SET driveFolderId = ? WHERE id = ?`, args: [first.folderId, 'trip-1'] });
        return { ref: first.folderId, keys: [first.fileIds[0], second.fileIds[0]] };
    }

    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await PHOTOS(new Request('http://localhost/api/media/photos?folderId=trip-photos/a/b'))).status).toBe(401);
        expect((await FILE(new Request('http://localhost/api/media/file?key=trip-photos/a/b/emprunt/x.jpg'))).status).toBe(401);
    });

    it('400 pour une clé ou un dossier forgé', async () => {
        mockedAuth.mockResolvedValue(session());
        for (const q of ['', '?folderId=../x', '?folderId=autre/a/b', '?folderId=trip-photos/a/b/emprunt']) {
            expect((await PHOTOS(new Request(`http://localhost/api/media/photos${q}`))).status).toBe(400);
        }
        for (const k of ['../x', 'ndf/paris-18/x/note-de-frais.pdf', 'trip-photos/a/b/../emprunt/x.jpg', 'trip-photos/a/b/x.jpg']) {
            expect((await FILE(new Request(`http://localhost/api/media/file?key=${encodeURIComponent(k)}`))).status).toBe(400);
        }
    });

    it('liste emprunt / rendu et sert le fichier (happy path)', async () => {
        const { ref, keys } = await seedTripWithPhotos();
        const res = await PHOTOS(new Request(`http://localhost/api/media/photos?folderId=${encodeURIComponent(ref)}`));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.emprunt).toEqual([{ id: keys[0], name: 'img-1.jpg' }]);
        expect(body.rendu).toEqual([{ id: keys[1], name: 'img-1.jpg' }]);

        const file = await FILE(new Request(`http://localhost/api/media/file?key=${encodeURIComponent(keys[0])}`));
        expect(file.status).toBe(200);
        expect(file.headers.get('Content-Type')).toBe('image/jpeg');
        expect(file.headers.get('Cache-Control')).toContain('private');
        expect(Buffer.from(await file.arrayBuffer()).toString()).toBe('jpeg');
    });

    it('flat=true : forme { photos } avec mimeType', async () => {
        const { ref, keys } = await seedTripWithPhotos();
        const body = await (await PHOTOS(new Request(`http://localhost/api/media/photos?folderId=${encodeURIComponent(ref)}&flat=true`))).json();
        expect(body.photos.map((p: { id: string }) => p.id).sort()).toEqual([...keys].sort());
        expect(body.photos[0].mimeType).toBe('image/jpeg');
    });

    it('403 pour un utilisateur d\'une autre UL, ou un dossier rattaché à rien', async () => {
        const { ref, keys } = await seedTripWithPhotos();
        mockedAuth.mockResolvedValue(session({ ulId: 'ul-lyon-3' }));
        expect((await PHOTOS(new Request(`http://localhost/api/media/photos?folderId=${encodeURIComponent(ref)}`))).status).toBe(403);
        expect((await FILE(new Request(`http://localhost/api/media/file?key=${encodeURIComponent(keys[0])}`))).status).toBe(403);

        mockedAuth.mockResolvedValue(session());
        expect((await PHOTOS(new Request('http://localhost/api/media/photos?folderId=trip-photos/paris-18/orphelin'))).status).toBe(403);
    });

    it('rapport signé : autorisé sur la clé exacte seulement', async () => {
        mockedAuth.mockResolvedValue(session({ roles: ['ADMIN'] }));
        const pdf = new File(['%PDF'], 'Rapport.pdf', { type: 'application/pdf' });
        const signed = await (await upload({ type: 'mission-report-photo', name: 'DPS' }, [pdf])).json();
        const key = signed.fileIds[0];
        expect((await FILE(new Request(`http://localhost/api/media/file?key=${encodeURIComponent(key)}`))).status).toBe(403);

        await db.execute({
            sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, ulId, signed_report_drive_id)
                  VALUES ('mr-1', 'user-1', '2026-10-01T10:00:00Z', 'DPS', 'DPS', '2026-10-01', 'Paris', '[]', 'ul-paris-18', ?)`,
            args: [key],
        });
        const ok = await FILE(new Request(`http://localhost/api/media/file?key=${encodeURIComponent(key)}`));
        expect(ok.status).toBe(200);
        expect(ok.headers.get('Content-Type')).toBe('application/pdf');
    });

    it('404 si l\'objet a disparu de R2', async () => {
        const { keys } = await seedTripWithPhotos();
        bucket.delete(keys[0]);
        expect((await FILE(new Request(`http://localhost/api/media/file?key=${encodeURIComponent(keys[0])}`))).status).toBe(404);
    });
});
