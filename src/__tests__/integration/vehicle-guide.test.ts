// @vitest-environment node
// Environnement node et non jsdom : la route lit un `multipart/form-data` via
// `Request.formData()` (undici). Les `File`/`FormData` de jsdom sont rejetés par
// la validation webidl d'undici — le corps multipart ne serait jamais construit.
/**
 * Tests d'intégration — guide de vérification PDF d'un véhicule.
 *
 *  /api/vehicles/[id]/guide   POST (dépôt, remplacement) · GET (inline, ?download=1) · DELETE
 *  /api/qr/[token]/guide      GET via le parcours QR (sans contrôle d'UL)
 *  /api/vehicles/[id] et /api/qr/[token]/vehicle exposent les métadonnées, jamais la clé R2.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/drive', () => ({ deleteDriveFolder: vi.fn() }));
vi.mock('@/lib/vehicleStatusRecalc', () => ({
    recalcVehicleStatus: vi.fn(async (_id: string, opts: { currentStatus: string }) => opts.currentStatus),
}));

// R2 est un service externe : toujours mocké (règle src/__tests__/CLAUDE.md).
// Le stockage en mémoire permet de vérifier ce qui est écrit, lu et supprimé.
const bucket = new Map<string, Buffer>();
let attemptCounter = 0;
vi.mock('@/lib/r2', () => ({
    putObject: vi.fn(async (key: string, body: Buffer) => { bucket.set(key, body); }),
    getObject: vi.fn(async (key: string) => bucket.get(key) ?? null),
    deleteObject: vi.fn(async (key: string) => { bucket.delete(key); }),
    buildVehicleGuideKey: (vehicleId: string, attempt: string) => `vehicle-guides/${vehicleId}/${attempt}.pdf`,
    newAttemptId: () => `att${++attemptCounter}`,
    R2Error: class R2Error extends Error {},
}));

import { auth } from '@/auth';
import { deleteObject } from '@/lib/r2';
import { GET as getGuide, POST as postGuide, DELETE as deleteGuide } from '@/app/api/vehicles/[id]/guide/route';
import { GET as getQrGuide } from '@/app/api/qr/[token]/guide/route';
import { GET as getVehicle, DELETE as deleteVehicle } from '@/app/api/vehicles/[id]/route';
import { GET as getQrVehicle } from '@/app/api/qr/[token]/vehicle/route';
import { db, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);

const VEHICLE = 'VPSP 182';
const ADMIN = { user: { id: 'u-admin', email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } };
const ADMIN_OTHER_UL = { user: { id: 'u-admin-17', email: 'admin17@test.com', roles: ['ADMIN'], ulId: 'ul-paris-17' } };
const SUPER_ADMIN = { user: { id: 'u-sa', email: 'sa@test.com', roles: ['SUPER_ADMIN'], ulId: 'ul-paris-17' } };
const VOLUNTEER = { user: { id: 'u-chvl', email: 'chvl@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } };
const VOLUNTEER_OTHER_UL = { user: { id: 'u-chvl-17', email: 'chvl17@test.com', roles: ['CHVL'], ulId: 'ul-paris-17' } };
const INACTIVE = { user: { id: 'u-inactif', email: 'inactif@test.com', roles: ['INACTIF'], ulId: 'ul-paris-18' } };

const PDF = Buffer.from('%PDF-1.7\n% guide de vérification\n%%EOF\n');

function asSession(s: unknown) {
    mockedAuth.mockResolvedValue(s as never);
}

function params(id = VEHICLE) {
    return { params: Promise.resolve({ id }) };
}

function qrParams(token = 'qr-182') {
    return { params: Promise.resolve({ token }) };
}

function uploadRequest(body: Buffer | string, fileName = 'VPSP 182.pdf', type = 'application/pdf'): Request {
    const formData = new FormData();
    formData.append('file', new File([new Uint8Array(Buffer.from(body))], fileName, { type }));
    return new Request(`http://localhost/api/vehicles/${encodeURIComponent(VEHICLE)}/guide`, {
        method: 'POST',
        body: formData,
    });
}

function getRequest(query = ''): Request {
    return new Request(`http://localhost/api/vehicles/${encodeURIComponent(VEHICLE)}/guide${query}`);
}

async function guideRow() {
    const res = await db.execute({
        sql: `SELECT guideR2Key, guideFileName, guideSize, guideUpdatedAt FROM Vehicle WHERE name = ?`,
        args: [VEHICLE],
    });
    return res.rows[0];
}

beforeEach(async () => {
    bucket.clear();
    attemptCounter = 0;
    vi.mocked(deleteObject).mockClear();
    mockedAuth.mockReset();
    await db.execute(`DELETE FROM Trip`);
    await db.execute(`DELETE FROM Vehicle`);
    await seedVehicle({ id: 'veh-182', name: VEHICLE, type: 'VPSP', qrToken: 'qr-182', ulId: 'ul-paris-18' });
});

describe('POST /api/vehicles/[id]/guide', () => {
    it('401 sans session', async () => {
        asSession(null);
        const res = await postGuide(uploadRequest(PDF), params());
        expect(res.status).toBe(401);
    });

    it('403 pour un non-administrateur (CHVL)', async () => {
        asSession(VOLUNTEER);
        const res = await postGuide(uploadRequest(PDF), params());
        expect(res.status).toBe(403);
        expect(bucket.size).toBe(0);
    });

    it("403 pour un administrateur d'une autre UL", async () => {
        asSession(ADMIN_OTHER_UL);
        const res = await postGuide(uploadRequest(PDF), params());
        expect(res.status).toBe(403);
        expect(bucket.size).toBe(0);
    });

    it('404 pour un véhicule inconnu', async () => {
        asSession(ADMIN);
        const res = await postGuide(uploadRequest(PDF), params('INCONNU'));
        expect(res.status).toBe(404);
    });

    it('400 pour un .pdf sans octets magiques %PDF — rien n\'est écrit', async () => {
        asSession(ADMIN);
        const res = await postGuide(uploadRequest('pas un pdf'), params());
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('Le fichier doit être un PDF.');
        expect(bucket.size).toBe(0);
        expect((await guideRow()).guideR2Key).toBeNull();
    });

    it('400 pour une image', async () => {
        asSession(ADMIN);
        const res = await postGuide(uploadRequest(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'photo.png', 'image/png'), params());
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('Le fichier doit être un PDF.');
    });

    it('400 sans fichier', async () => {
        asSession(ADMIN);
        const req = new Request('http://localhost/api/vehicles/x/guide', { method: 'POST', body: new FormData() });
        const res = await postGuide(req, params());
        expect(res.status).toBe(400);
    });

    it('413 pour un PDF de 5 Mo — rien n\'est écrit', async () => {
        asSession(ADMIN);
        const big = Buffer.alloc(5 * 1024 * 1024, 0x20);
        PDF.copy(big);
        const res = await postGuide(uploadRequest(big), params());
        expect(res.status).toBe(413);
        expect((await res.json()).error).toContain('4 Mo maximum');
        expect(bucket.size).toBe(0);
        expect((await guideRow()).guideR2Key).toBeNull();
    });

    it('200 — enregistre le PDF dans R2 et ses métadonnées en base', async () => {
        asSession(ADMIN);
        const res = await postGuide(uploadRequest(PDF), params());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.guide).toMatchObject({ fileName: 'VPSP 182.pdf', size: PDF.length });

        const row = await guideRow();
        expect(row.guideR2Key).toBe('vehicle-guides/veh-182/att1.pdf');
        expect(row.guideFileName).toBe('VPSP 182.pdf');
        expect(Number(row.guideSize)).toBe(PDF.length);
        expect(row.guideUpdatedAt).toBeTruthy();
        expect(bucket.get('vehicle-guides/veh-182/att1.pdf')?.equals(PDF)).toBe(true);
    });

    it('SUPER_ADMIN peut déposer sur un véhicule de toute UL', async () => {
        asSession(SUPER_ADMIN);
        const res = await postGuide(uploadRequest(PDF), params());
        expect(res.status).toBe(200);
    });

    it("remplacement — nouvelle clé en base, l'ancien objet est supprimé", async () => {
        asSession(ADMIN);
        await postGuide(uploadRequest(PDF), params());
        const res = await postGuide(uploadRequest(PDF, 'Guide v2.pdf'), params());
        expect(res.status).toBe(200);

        const row = await guideRow();
        expect(row.guideR2Key).toBe('vehicle-guides/veh-182/att2.pdf');
        expect(row.guideFileName).toBe('Guide v2.pdf');
        expect(bucket.has('vehicle-guides/veh-182/att1.pdf')).toBe(false);
        expect(bucket.has('vehicle-guides/veh-182/att2.pdf')).toBe(true);
    });

    it("remplacement — un échec de suppression de l'ancien objet n'est pas une erreur", async () => {
        asSession(ADMIN);
        await postGuide(uploadRequest(PDF), params());
        vi.mocked(deleteObject).mockRejectedValueOnce(new Error('R2 indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const res = await postGuide(uploadRequest(PDF, 'Guide v2.pdf'), params());
        expect(res.status).toBe(200);
        expect((await guideRow()).guideR2Key).toBe('vehicle-guides/veh-182/att2.pdf');
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});

describe('GET /api/vehicles/[id]/guide', () => {
    beforeEach(async () => {
        asSession(ADMIN);
        await postGuide(uploadRequest(PDF), params());
    });

    it('401 sans session', async () => {
        asSession(null);
        const res = await getGuide(getRequest(), params());
        expect(res.status).toBe(401);
    });

    it('lecture inline par un bénévole de la même UL', async () => {
        asSession(VOLUNTEER);
        const res = await getGuide(getRequest(), params());
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
        expect(res.headers.get('Content-Disposition')).toMatch(/^inline; filename="VPSP 182.pdf"/);
        expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
    });

    it('téléchargement avec ?download=1 sous le nom d\'origine', async () => {
        asSession(VOLUNTEER);
        const res = await getGuide(getRequest('?download=1'), params());
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="VPSP 182.pdf"/);
    });

    it('403 pour un compte INACTIF de la même UL', async () => {
        asSession(INACTIVE);
        const res = await getGuide(getRequest(), params());
        expect(res.status).toBe(403);
    });

    it("404 pour un bénévole d'une autre UL", async () => {
        asSession(VOLUNTEER_OTHER_UL);
        const res = await getGuide(getRequest(), params());
        expect(res.status).toBe(404);
    });

    it('404 pour un véhicule sans guide', async () => {
        await db.execute(`UPDATE Vehicle SET guideR2Key = NULL, guideFileName = NULL WHERE id = 'veh-182'`);
        asSession(VOLUNTEER);
        const res = await getGuide(getRequest(), params());
        expect(res.status).toBe(404);
    });

    it('409 si la clé en base est absente du bucket', async () => {
        bucket.clear();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        asSession(VOLUNTEER);
        const res = await getGuide(getRequest(), params());
        expect(res.status).toBe(409);
        errorSpy.mockRestore();
    });
});

describe('DELETE /api/vehicles/[id]/guide', () => {
    beforeEach(async () => {
        asSession(ADMIN);
        await postGuide(uploadRequest(PDF), params());
    });

    it('401 sans session', async () => {
        asSession(null);
        const res = await deleteGuide(getRequest(), params());
        expect(res.status).toBe(401);
    });

    it('403 pour un non-administrateur', async () => {
        asSession(VOLUNTEER);
        const res = await deleteGuide(getRequest(), params());
        expect(res.status).toBe(403);
        expect((await guideRow()).guideR2Key).not.toBeNull();
    });

    it("403 pour un administrateur d'une autre UL", async () => {
        asSession(ADMIN_OTHER_UL);
        const res = await deleteGuide(getRequest(), params());
        expect(res.status).toBe(403);
    });

    it('retrait — colonnes à NULL et objet supprimé', async () => {
        asSession(ADMIN);
        const res = await deleteGuide(getRequest(), params());
        expect(res.status).toBe(200);
        const row = await guideRow();
        expect(row.guideR2Key).toBeNull();
        expect(row.guideFileName).toBeNull();
        expect(row.guideSize).toBeNull();
        expect(row.guideUpdatedAt).toBeNull();
        expect(bucket.size).toBe(0);
    });

    it('retrait idempotent sur un véhicule sans guide', async () => {
        asSession(ADMIN);
        await deleteGuide(getRequest(), params());
        const res = await deleteGuide(getRequest(), params());
        expect(res.status).toBe(200);
    });
});

describe('GET /api/qr/[token]/guide', () => {
    beforeEach(async () => {
        asSession(ADMIN);
        await postGuide(uploadRequest(PDF), params());
    });

    function qrRequest(query = '') {
        return new Request(`http://localhost/api/qr/qr-182/guide${query}`);
    }

    it('401 sans session', async () => {
        asSession(null);
        const res = await getQrGuide(qrRequest(), qrParams());
        expect(res.status).toBe(401);
    });

    it('403 pour un compte INACTIF', async () => {
        asSession(INACTIVE);
        const res = await getQrGuide(qrRequest(), qrParams());
        expect(res.status).toBe(403);
    });

    it("lecture par un bénévole d'une autre UL (bypass QR)", async () => {
        asSession(VOLUNTEER_OTHER_UL);
        const res = await getQrGuide(qrRequest(), qrParams());
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Disposition')).toMatch(/^inline; /);
        expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
    });

    it('téléchargement avec ?download=1', async () => {
        asSession(VOLUNTEER_OTHER_UL);
        const res = await getQrGuide(qrRequest('?download=1'), qrParams());
        expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="VPSP 182.pdf"/);
    });

    it('404 pour un token inconnu', async () => {
        asSession(VOLUNTEER);
        const res = await getQrGuide(qrRequest(), qrParams('inconnu'));
        expect(res.status).toBe(404);
    });

    it('404 pour un véhicule sans guide', async () => {
        asSession(ADMIN);
        await deleteGuide(getRequest(), params());
        asSession(VOLUNTEER);
        const res = await getQrGuide(qrRequest(), qrParams());
        expect(res.status).toBe(404);
    });
});

describe('Métadonnées du guide dans les fiches véhicule', () => {
    it('GET /api/vehicles/[id] expose nom, taille et date — jamais la clé R2', async () => {
        asSession(ADMIN);
        await postGuide(uploadRequest(PDF), params());
        asSession(VOLUNTEER);
        const res = await getVehicle(new Request('http://localhost/api/vehicles/x'), params());
        const body = await res.json();
        expect(body.guideFileName).toBe('VPSP 182.pdf');
        expect(body.guideSize).toBe(PDF.length);
        expect(body.guideUpdatedAt).toBeTruthy();
        expect(JSON.stringify(body)).not.toContain('vehicle-guides/');
    });

    it('GET /api/vehicles/[id] renvoie des métadonnées nulles sans guide', async () => {
        asSession(VOLUNTEER);
        const res = await getVehicle(new Request('http://localhost/api/vehicles/x'), params());
        const body = await res.json();
        expect(body.guideFileName).toBeNull();
    });

    it('GET /api/qr/[token]/vehicle expose les métadonnées — jamais la clé R2', async () => {
        asSession(ADMIN);
        await postGuide(uploadRequest(PDF), params());
        asSession(VOLUNTEER_OTHER_UL);
        const res = await getQrVehicle(new Request('http://localhost/api/qr/qr-182/vehicle'), qrParams());
        const body = await res.json();
        expect(body.guideFileName).toBe('VPSP 182.pdf');
        expect(JSON.stringify(body)).not.toContain('vehicle-guides/');
    });
});

describe('DELETE /api/vehicles/[id] — nettoyage du guide', () => {
    const deleteRequest = () => new Request('http://localhost/api/vehicles/x', { method: 'DELETE' });

    it("supprime l'objet guide du bucket", async () => {
        asSession(ADMIN);
        await postGuide(uploadRequest(PDF), params());
        expect(bucket.size).toBe(1);

        const res = await deleteVehicle(deleteRequest(), params());
        expect(res.status).toBe(200);
        expect(bucket.size).toBe(0);
        expect(deleteObject).toHaveBeenCalledWith('vehicle-guides/veh-182/att1.pdf');
    });

    it('répond 200 même si la suppression R2 échoue', async () => {
        asSession(ADMIN);
        await postGuide(uploadRequest(PDF), params());
        vi.mocked(deleteObject).mockRejectedValueOnce(new Error('R2 indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const res = await deleteVehicle(deleteRequest(), params());
        expect(res.status).toBe(200);
        expect((await db.execute(`SELECT id FROM Vehicle WHERE id = 'veh-182'`)).rows).toHaveLength(0);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("n'appelle pas R2 pour un véhicule sans guide", async () => {
        asSession(ADMIN);
        const res = await deleteVehicle(deleteRequest(), params());
        expect(res.status).toBe(200);
        expect(deleteObject).not.toHaveBeenCalled();
    });
});
