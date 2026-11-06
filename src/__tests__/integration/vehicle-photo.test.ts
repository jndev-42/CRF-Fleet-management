// @vitest-environment node
// Environnement node et non jsdom : la route lit un `multipart/form-data` via
// `Request.formData()` (undici), incompatible avec les `File`/`FormData` de jsdom.
/**
 * Tests d'intégration — photo d'un véhicule.
 *
 *  /api/vehicles/[id]/photo   POST (dépôt, remplacement) · GET · DELETE
 *  /api/qr/[token]/photo      GET via le parcours QR (sans contrôle d'UL)
 *  Aucune réponse API n'expose la clé R2 ; la suppression du véhicule nettoie l'objet.
 *
 * `sharp` n'est PAS mocké : la normalisation (orientation, taille, EXIF) est vérifiée
 * sur de vrais octets.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import sharp from 'sharp';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/drive', () => ({ deleteDriveFolder: vi.fn() }));
vi.mock('@/lib/push', () => ({
    sendPushNotification: vi.fn().mockResolvedValue(undefined),
    notifyRoles: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
    getRenaultVehicleData: vi.fn().mockResolvedValue(null),
    isConnectedInDb: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/vehicleStatusRecalc', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/vehicleStatusRecalc')>()),
    recalcVehicleStatus: vi.fn(async (_id: string, opts: { currentStatus: string }) => opts.currentStatus),
}));

// R2 est un service externe : toujours mocké. Le stockage en mémoire permet de
// vérifier ce qui est écrit, lu et supprimé.
const bucket = new Map<string, Buffer>();
let attemptCounter = 0;
vi.mock('@/lib/r2', () => ({
    putObject: vi.fn(async (key: string, body: Buffer) => { bucket.set(key, body); }),
    getObject: vi.fn(async (key: string) => bucket.get(key) ?? null),
    deleteObject: vi.fn(async (key: string) => { bucket.delete(key); }),
    buildVehiclePhotoKey: (vehicleId: string, attempt: string) => `vehicle-photos/${vehicleId}/${attempt}.jpg`,
    newAttemptId: () => `att${++attemptCounter}`,
    R2Error: class R2Error extends Error {},
}));

import { auth } from '@/auth';
import { deleteObject, putObject } from '@/lib/r2';
import { GET as getPhoto, POST as postPhoto, DELETE as deletePhoto } from '@/app/api/vehicles/[id]/photo/route';
import { GET as getQrPhoto } from '@/app/api/qr/[token]/photo/route';
import { GET as getVehicle, DELETE as deleteVehicle, PATCH as patchVehicle } from '@/app/api/vehicles/[id]/route';
import { GET as getVehicles, POST as postVehicle } from '@/app/api/vehicles/route';
import { GET as getQrVehicle } from '@/app/api/qr/[token]/vehicle/route';
import { PATCH as patchMetrics } from '@/app/api/vehicles/[id]/metrics/route';
import { POST as postTrip } from '@/app/api/trips/route';
import { PATCH as patchCheckin } from '@/app/api/trips/[id]/checkin/route';
import { db, seedVehicle, seedTrip, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

const VEHICLE = 'VPSP 182';
const VEHICLE_ID = 'veh-182';
const KEY_1 = `vehicle-photos/${VEHICLE_ID}/att1.jpg`;
const KEY_2 = `vehicle-photos/${VEHICLE_ID}/att2.jpg`;
const INVALID_FORMAT = 'La photo doit être au format JPEG, PNG ou WebP.';

const ADMIN = { user: { id: 'u-admin', email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } };
const RESP_VEHICULE = { user: { id: 'u-rv', email: 'rv@test.com', roles: ['RESP_VEHICULE'], ulId: 'ul-paris-18' } };
const ADMIN_OTHER_UL = { user: { id: 'u-admin-17', email: 'admin17@test.com', roles: ['ADMIN'], ulId: 'ul-paris-17' } };
const SUPER_ADMIN = { user: { id: 'u-sa', email: 'sa@test.com', roles: ['SUPER_ADMIN'], ulId: 'ul-paris-17' } };
const VOLUNTEER = { user: { id: 'u-chvl', email: 'chvl@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } };
const VOLUNTEER_OTHER_UL = { user: { id: 'u-chvl-17', email: 'chvl17@test.com', roles: ['CHVL'], ulId: 'ul-paris-17' } };
const INACTIVE = { user: { id: 'u-inactif', email: 'inactif@test.com', roles: ['INACTIF'], ulId: 'ul-paris-18' } };

const solid = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } });

function asSession(s: unknown) {
    mockedAuth.mockResolvedValue(s as never);
}

const params = (id = VEHICLE) => ({ params: Promise.resolve({ id }) });
const qrParams = (token = 'qr-182') => ({ params: Promise.resolve({ token }) });
const photoRequest = () => new Request(`http://localhost/api/vehicles/${encodeURIComponent(VEHICLE)}/photo`);
const qrRequest = () => new Request('http://localhost/api/qr/qr-182/photo');

function uploadRequest(body: Buffer | string, fileName = 'photo.jpg', type = 'image/jpeg'): Request {
    const formData = new FormData();
    formData.append('file', new File([new Uint8Array(Buffer.from(body))], fileName, { type }));
    return new Request(`http://localhost/api/vehicles/${encodeURIComponent(VEHICLE)}/photo`, {
        method: 'POST',
        body: formData,
    });
}

async function photoRow() {
    const res = await db.execute({
        sql: `SELECT photoR2Key, photoUpdatedAt FROM Vehicle WHERE name = ?`,
        args: [VEHICLE],
    });
    return res.rows[0];
}

let JPEG: Buffer;

/** Dépose une photo en gestionnaire, puis laisse la session sur `then`. */
async function seedPhoto(then: unknown = ADMIN) {
    asSession(ADMIN);
    const res = await postPhoto(uploadRequest(JPEG), params());
    expect(res.status).toBe(200);
    asSession(then);
}

beforeEach(async () => {
    JPEG ??= await solid(64, 48).jpeg().toBuffer();
    bucket.clear();
    attemptCounter = 0;
    vi.mocked(deleteObject).mockClear();
    vi.mocked(putObject).mockClear();
    mockedAuth.mockReset();
    await db.execute(`DELETE FROM Trip`);
    await db.execute(`DELETE FROM Vehicle`);
    await seedVehicle({ id: VEHICLE_ID, name: VEHICLE, type: 'VPSP', qrToken: 'qr-182', ulId: 'ul-paris-18' });
});

describe('POST /api/vehicles/[id]/photo — droits', () => {
    it('401 sans session', async () => {
        asSession(null);
        expect((await postPhoto(uploadRequest(JPEG), params())).status).toBe(401);
    });

    it('403 pour un rôle insuffisant', async () => {
        asSession(VOLUNTEER);
        expect((await postPhoto(uploadRequest(JPEG), params())).status).toBe(403);
        expect(bucket.size).toBe(0);
    });

    it("403 pour un gestionnaire d'une autre UL", async () => {
        asSession(ADMIN_OTHER_UL);
        expect((await postPhoto(uploadRequest(JPEG), params())).status).toBe(403);
        expect(bucket.size).toBe(0);
    });

    it('404 pour un véhicule inconnu', async () => {
        asSession(ADMIN);
        expect((await postPhoto(uploadRequest(JPEG), params('INCONNU'))).status).toBe(404);
    });

    it.each([['RESP_VEHICULE', RESP_VEHICULE], ['SUPER_ADMIN (toute UL)', SUPER_ADMIN]])('200 pour %s', async (_label, session) => {
        asSession(session);
        expect((await postPhoto(uploadRequest(JPEG), params())).status).toBe(200);
    });
});

describe('POST /api/vehicles/[id]/photo — validation', () => {
    beforeEach(() => asSession(ADMIN));

    it.each([
        ['PDF renommé .jpg', Buffer.from('%PDF-1.7\n%%EOF\n'), 'photo.jpg', 'image/jpeg'],
        ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'photo.svg', 'image/svg+xml'],
        ['HEIC', Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic')]), 'photo.heic', 'image/heic'],
        ['octets quelconques', Buffer.from('pas une image'), 'photo.jpg', 'image/jpeg'],
        ['JPEG tronqué', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), 'photo.jpg', 'image/jpeg'],
    ])('400 pour %s — rien n\'est écrit', async (_label, body, name, type) => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const res = await postPhoto(uploadRequest(body, name, type), params());
        errorSpy.mockRestore();
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe(INVALID_FORMAT);
        expect(bucket.size).toBe(0);
        expect((await photoRow()).photoR2Key).toBeNull();
    });

    it('400 sans fichier', async () => {
        const req = new Request('http://localhost/api/vehicles/x/photo', { method: 'POST', body: new FormData() });
        expect((await postPhoto(req, params())).status).toBe(400);
    });

    it('400 pour un corps non multipart', async () => {
        const req = new Request('http://localhost/api/vehicles/x/photo', { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } });
        expect((await postPhoto(req, params())).status).toBe(400);
    });

    it('413 pour une photo de 5 Mo — rien n\'est écrit', async () => {
        const big = Buffer.alloc(5 * 1024 * 1024);
        JPEG.copy(big);
        const res = await postPhoto(uploadRequest(big), params());
        expect(res.status).toBe(413);
        expect((await res.json()).error).toBe('La photo est trop volumineuse (4 Mo maximum).');
        expect(bucket.size).toBe(0);
        expect((await photoRow()).photoR2Key).toBeNull();
    });
});

describe('POST /api/vehicles/[id]/photo — normalisation', () => {
    beforeEach(() => asSession(ADMIN));

    async function storedAfterUpload(input: Buffer, name = 'photo.jpg', type = 'image/jpeg') {
        const res = await postPhoto(uploadRequest(input, name, type), params());
        expect(res.status).toBe(200);
        const stored = bucket.get(KEY_1);
        expect(stored).toBeDefined();
        return stored as Buffer;
    }

    it('200 — renvoie photoUpdatedAt, écrit le JPEG et la base, sans exposer la clé', async () => {
        const res = await postPhoto(uploadRequest(JPEG), params());
        expect(res.status).toBe(200);
        const body = await res.json();
        const row = await photoRow();
        expect(body).toEqual({ success: true, photoUpdatedAt: row.photoUpdatedAt });
        expect(row.photoR2Key).toBe(KEY_1);
        expect(putObject).toHaveBeenCalledWith(KEY_1, expect.any(Buffer), 'image/jpeg');
        expect((await sharp(bucket.get(KEY_1)).metadata()).format).toBe('jpeg');
    });

    it('applique l\'orientation EXIF et retire EXIF et GPS', async () => {
        const input = await solid(200, 100)
            .withExif({ IFD0: { Copyright: 'SECRET-EXIF' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 0/1' } })
            .withMetadata({ orientation: 6 })
            .jpeg()
            .toBuffer();
        // Le fichier d'entrée porte bien ce que le test prétend retirer.
        const before = await sharp(input).metadata();
        expect(before.orientation).toBe(6);
        expect(before.exif?.includes('SECRET-EXIF')).toBe(true);
        expect(before.exif?.includes('GPS') || before.exif?.includes(Buffer.from([0x25, 0x88])) || before.exif?.includes(Buffer.from([0x88, 0x25]))).toBe(true);

        const stored = await storedAfterUpload(input);
        const after = await sharp(stored).metadata();
        expect(after.exif).toBeUndefined();
        expect(after.iptc).toBeUndefined();
        expect(after.xmp).toBeUndefined();
        expect(after.orientation).toBeUndefined();
        expect(stored.includes('SECRET-EXIF')).toBe(false);
        // 200×100 couché, orientation 6 : redressé en portrait.
        expect([after.width, after.height]).toEqual([100, 200]);
    });

    it('réduit à 1600 px max en gardant les proportions', async () => {
        const stored = await storedAfterUpload(await solid(3200, 2000).jpeg().toBuffer());
        const { width, height } = await sharp(stored).metadata();
        expect([width, height]).toEqual([1600, 1000]);
    });

    it("n'agrandit pas une petite photo", async () => {
        const { width, height } = await sharp(await storedAfterUpload(JPEG)).metadata();
        expect([width, height]).toEqual([64, 48]);
    });

    it('convertit un PNG en JPEG, transparence sur fond blanc', async () => {
        const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
        const stored = await storedAfterUpload(png, 'photo.png', 'image/png');
        expect((await sharp(stored).metadata()).format).toBe('jpeg');
        const { dominant } = await sharp(stored).stats();
        expect(dominant.r).toBeGreaterThan(240);
    });

    it('accepte un WebP et le convertit en JPEG', async () => {
        const stored = await storedAfterUpload(await solid(16, 16).webp().toBuffer(), 'photo.webp', 'image/webp');
        expect((await sharp(stored).metadata()).format).toBe('jpeg');
    });
});

describe('POST /api/vehicles/[id]/photo — remplacement', () => {
    it("nouvelle clé en base, l'ancien objet est supprimé", async () => {
        await seedPhoto();
        const before = (await photoRow()).photoUpdatedAt;
        await new Promise(r => setTimeout(r, 2));
        expect((await postPhoto(uploadRequest(JPEG), params())).status).toBe(200);
        const row = await photoRow();
        expect(row.photoR2Key).toBe(KEY_2);
        expect(row.photoUpdatedAt).not.toBe(before);
        expect(bucket.has(KEY_1)).toBe(false);
        expect(bucket.has(KEY_2)).toBe(true);
    });

    it("un échec de suppression de l'ancien objet est seulement journalisé", async () => {
        await seedPhoto();
        vi.mocked(deleteObject).mockRejectedValueOnce(new Error('R2 indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const res = await postPhoto(uploadRequest(JPEG), params());
        expect(res.status).toBe(200);
        expect((await photoRow()).photoR2Key).toBe(KEY_2);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("500 sans toucher à la base ni à l'ancien objet si l'écriture R2 échoue", async () => {
        await seedPhoto();
        vi.mocked(putObject).mockRejectedValueOnce(new Error('R2 indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const res = await postPhoto(uploadRequest(JPEG), params());
        expect(res.status).toBe(500);
        expect((await photoRow()).photoR2Key).toBe(KEY_1);
        expect(bucket.has(KEY_1)).toBe(true);
        errorSpy.mockRestore();
    });

    it("500 et nouvel objet nettoyé si la bascule en base échoue, l'ancien reste en place", async () => {
        await seedPhoto();
        const realExecute = db.execute.bind(db);
        const executeSpy = vi.spyOn(db, 'execute').mockImplementation(((stmt: string | { sql: string; args: never[] }) => {
            const sql = typeof stmt === 'string' ? stmt : stmt.sql;
            return sql.startsWith('UPDATE Vehicle SET photoR2Key')
                ? Promise.reject(new Error('base indisponible'))
                : realExecute(stmt);
        }) as typeof db.execute);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const res = await postPhoto(uploadRequest(JPEG), params());
        executeSpy.mockRestore();
        errorSpy.mockRestore();

        expect(res.status).toBe(500);
        expect(putObject).toHaveBeenCalledWith(KEY_2, expect.any(Buffer), 'image/jpeg');
        expect((await photoRow()).photoR2Key).toBe(KEY_1);
        expect(bucket.has(KEY_1)).toBe(true);
        expect(bucket.has(KEY_2)).toBe(false);
    });
});

describe('GET /api/vehicles/[id]/photo', () => {
    it('401 sans session', async () => {
        await seedPhoto(null);
        expect((await getPhoto(photoRequest(), params())).status).toBe(401);
    });

    it('lecture par un bénévole de la même UL, avec cache privé de 24 h', async () => {
        await seedPhoto(VOLUNTEER);
        const res = await getPhoto(photoRequest(), params());
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/jpeg');
        expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400');
        expect(Buffer.from(await res.arrayBuffer()).equals(bucket.get(KEY_1)!)).toBe(true);
    });

    it('403 pour un compte INACTIF', async () => {
        await seedPhoto(INACTIVE);
        expect((await getPhoto(photoRequest(), params())).status).toBe(403);
    });

    it("404 hors UL (véhicule indiscernable d'un véhicule inexistant)", async () => {
        await seedPhoto(VOLUNTEER_OTHER_UL);
        expect((await getPhoto(photoRequest(), params())).status).toBe(404);
    });

    it('404 sans photo', async () => {
        asSession(VOLUNTEER);
        expect((await getPhoto(photoRequest(), params())).status).toBe(404);
    });

    it('409 et journal si la clé est absente du bucket', async () => {
        await seedPhoto(VOLUNTEER);
        bucket.clear();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect((await getPhoto(photoRequest(), params())).status).toBe(409);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});

describe('DELETE /api/vehicles/[id]/photo', () => {
    it('401 sans session', async () => {
        await seedPhoto(null);
        expect((await deletePhoto(photoRequest(), params())).status).toBe(401);
    });

    it('403 pour un rôle insuffisant', async () => {
        await seedPhoto(VOLUNTEER);
        expect((await deletePhoto(photoRequest(), params())).status).toBe(403);
        expect((await photoRow()).photoR2Key).toBe(KEY_1);
    });

    it("403 pour un gestionnaire d'une autre UL", async () => {
        await seedPhoto(ADMIN_OTHER_UL);
        expect((await deletePhoto(photoRequest(), params())).status).toBe(403);
    });

    it('retrait — colonnes à NULL et objet supprimé', async () => {
        await seedPhoto();
        expect((await deletePhoto(photoRequest(), params())).status).toBe(200);
        const row = await photoRow();
        expect(row.photoR2Key).toBeNull();
        expect(row.photoUpdatedAt).toBeNull();
        expect(bucket.size).toBe(0);
    });

    it('idempotent sans photo', async () => {
        asSession(ADMIN);
        expect((await deletePhoto(photoRequest(), params())).status).toBe(200);
        expect(deleteObject).not.toHaveBeenCalled();
    });

    it("un échec de suppression de l'objet est seulement journalisé", async () => {
        await seedPhoto();
        vi.mocked(deleteObject).mockRejectedValueOnce(new Error('R2 indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect((await deletePhoto(photoRequest(), params())).status).toBe(200);
        expect((await photoRow()).photoR2Key).toBeNull();
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});

describe('GET /api/qr/[token]/photo', () => {
    it('401 sans session', async () => {
        await seedPhoto(null);
        expect((await getQrPhoto(qrRequest(), qrParams())).status).toBe(401);
    });

    it('403 pour un compte INACTIF', async () => {
        await seedPhoto(INACTIVE);
        expect((await getQrPhoto(qrRequest(), qrParams())).status).toBe(403);
    });

    it("lecture par un bénévole d'une autre UL (bypass QR)", async () => {
        await seedPhoto(VOLUNTEER_OTHER_UL);
        const res = await getQrPhoto(qrRequest(), qrParams());
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400');
    });

    it('404 pour un token inconnu', async () => {
        await seedPhoto(VOLUNTEER);
        expect((await getQrPhoto(qrRequest(), qrParams('inconnu'))).status).toBe(404);
    });

    it('404 sans photo', async () => {
        asSession(VOLUNTEER);
        expect((await getQrPhoto(qrRequest(), qrParams())).status).toBe(404);
    });

    it('409 si la clé est absente du bucket', async () => {
        await seedPhoto(VOLUNTEER);
        bucket.clear();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect((await getQrPhoto(qrRequest(), qrParams())).status).toBe(409);
        errorSpy.mockRestore();
    });
});

describe("Exposition dans l'API : photoUpdatedAt, jamais une clé R2", () => {
    const jsonRequest = (method: string, body: unknown) => new Request('http://localhost/api/x', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    /** Un guide déposé : sa clé doit rester aussi invisible que celle de la photo. */
    const seedGuide = () => db.execute({
        sql: `UPDATE Vehicle SET guideR2Key = ?, guideFileName = 'guide.pdf' WHERE id = ?`,
        args: [`vehicle-guides/${VEHICLE_ID}/att1.pdf`, VEHICLE_ID],
    });

    const expectNoR2Key = (text: string) => {
        expect(text).not.toContain('photoR2Key');
        expect(text).not.toContain('vehicle-photos/');
        expect(text).not.toContain('guideR2Key');
        expect(text).not.toContain('vehicle-guides/');
    };

    it('GET /api/vehicles/[id] expose la version', async () => {
        await seedPhoto(VOLUNTEER);
        const res = await getVehicle(new Request('http://localhost/api/vehicles/x'), params());
        const text = await res.text();
        expect(JSON.parse(text).photoUpdatedAt).toBe((await photoRow()).photoUpdatedAt);
        expect(text).not.toContain('vehicle-photos/');
        expect(text).not.toContain('photoR2Key');
    });

    it('GET /api/vehicles/[id] renvoie null sans photo', async () => {
        asSession(VOLUNTEER);
        const res = await getVehicle(new Request('http://localhost/api/vehicles/x'), params());
        expect((await res.json()).photoUpdatedAt).toBeNull();
    });

    it('GET /api/qr/[token]/vehicle expose la version', async () => {
        await seedPhoto(VOLUNTEER_OTHER_UL);
        const res = await getQrVehicle(new Request('http://localhost/api/qr/qr-182/vehicle'), qrParams());
        const text = await res.text();
        expect(JSON.parse(text).photoUpdatedAt).toBe((await photoRow()).photoUpdatedAt);
        expect(text).not.toContain('vehicle-photos/');
    });

    it('GET /api/vehicles ne porte ni la clé ni aucune donnée de vignette', async () => {
        await seedPhoto();
        const res = await getVehicles(new Request('http://localhost/api/vehicles'));
        const text = await res.text();
        expect(JSON.parse(text)).toHaveLength(1);
        expect(text).not.toContain('vehicle-photos/');
        expect(text).not.toContain('photoR2Key');
        expect(text).not.toContain('photoUpdatedAt');
    });

    it('PATCH /api/vehicles/[id]/metrics — mise à jour et absence de changement', async () => {
        await seedPhoto();
        await seedGuide();
        const updated = await patchMetrics(jsonRequest('PATCH', { mileage: 99999 }), params(VEHICLE_ID));
        expect(updated.status).toBe(200);
        const updatedText = await updated.text();
        expect(updatedText).toContain('99999');
        expectNoR2Key(updatedText);

        const unchanged = await patchMetrics(jsonRequest('PATCH', { mileage: 99999 }), params(VEHICLE_ID));
        expect(unchanged.status).toBe(200);
        const unchangedText = await unchanged.text();
        expect(unchangedText).toContain('Aucun changement');
        expectNoR2Key(unchangedText);
    });

    it('POST /api/trips — le véhicule renvoyé ne porte aucune clé R2', async () => {
        await seedPhoto();
        await seedGuide();
        await seedUser({ id: ADMIN.user.id, email: ADMIN.user.email });
        const res = await postTrip(jsonRequest('POST', {
            vehicleId: VEHICLE_ID,
            missionType: 'DPS',
            conditionOut: 'Bon état',
            dsaChecked: true,
        }));
        expect(res.status).toBe(201);
        const text = await res.text();
        expect(JSON.parse(text).vehicle.id).toBe(VEHICLE_ID);
        expectNoR2Key(text);
    });

    it('PATCH /api/trips/[id]/checkin — le véhicule renvoyé ne porte aucune clé R2', async () => {
        await seedPhoto();
        await seedGuide();
        await seedUser({ id: ADMIN.user.id, email: ADMIN.user.email });
        await seedTrip({ id: 'trip-1', vehicleId: VEHICLE_ID, driverId: ADMIN.user.id, mileageOut: 1000 });
        const res = await patchCheckin(
            jsonRequest('PATCH', { conditionIn: 'Bon état', mileageIn: 1010, fuelIn: 50 }),
            { params: Promise.resolve({ id: 'trip-1' }) },
        );
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(JSON.parse(text).vehicle.id).toBe(VEHICLE_ID);
        expectNoR2Key(text);
    });

    it('les payloads JSON de création et de modification ignorent une photo', async () => {
        asSession(ADMIN);
        const created = await postVehicle(jsonRequest('POST', {
            name: 'VL999', type: 'VL', plate: 'ZZ-999-ZZ', fuelLevel: 100, mileage: 0, photoR2Key: 'vehicle-photos/pirate.jpg',
        }));
        expect(created.status).toBe(201);
        const patched = await patchVehicle(jsonRequest('PATCH', { notes: 'ok', photoR2Key: 'vehicle-photos/pirate.jpg', photoUpdatedAt: 'x' }), params());
        expect(patched.status).toBe(200);
        expect((await photoRow()).photoR2Key).toBeNull();
        const row = await db.execute(`SELECT photoR2Key FROM Vehicle WHERE name = 'VL999'`);
        expect(row.rows[0].photoR2Key).toBeNull();
    });
});

describe('DELETE /api/vehicles/[id] — nettoyage de la photo', () => {
    const deleteRequest = () => new Request('http://localhost/api/vehicles/x', { method: 'DELETE' });

    it("supprime l'objet du bucket", async () => {
        await seedPhoto();
        expect((await deleteVehicle(deleteRequest(), params())).status).toBe(200);
        expect(bucket.size).toBe(0);
        expect(deleteObject).toHaveBeenCalledWith(KEY_1);
    });

    it('répond 200 et supprime le véhicule même si R2 échoue', async () => {
        await seedPhoto();
        vi.mocked(deleteObject).mockRejectedValueOnce(new Error('R2 indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect((await deleteVehicle(deleteRequest(), params())).status).toBe(200);
        expect((await db.execute(`SELECT id FROM Vehicle WHERE id = '${VEHICLE_ID}'`)).rows).toHaveLength(0);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("n'appelle pas R2 sans photo", async () => {
        asSession(ADMIN);
        expect((await deleteVehicle(deleteRequest(), params())).status).toBe(200);
        expect(deleteObject).not.toHaveBeenCalled();
    });
});
