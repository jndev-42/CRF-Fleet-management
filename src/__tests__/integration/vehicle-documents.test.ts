// @vitest-environment node
// Environnement node et non jsdom : la route lit un `multipart/form-data` via
// `Request.formData()` (undici). Les `File`/`FormData` de jsdom sont rejetés par
// la validation webidl d'undici — le corps multipart ne serait jamais construit.
/**
 * Tests d'intégration — documents liés à un véhicule (plusieurs PDF).
 *
 *  /api/vehicles/[id]/documents                 POST (dépôt d'un fichier)
 *  /api/vehicles/[id]/documents/[documentId]    GET (inline, ?download=1) · DELETE
 *  /api/qr/[token]/documents/[documentId]       GET via le parcours QR (sans contrôle d'UL)
 *  /api/vehicles/[id] et /api/qr/[token]/vehicle exposent `documents`, jamais la clé R2.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/vehicleStatusRecalc', () => ({
    recalcVehicleStatus: vi.fn(async (_id: string, opts: { currentStatus: string }) => opts.currentStatus),
}));

// R2 est un service externe : toujours mocké (règle src/__tests__/CLAUDE.md).
// Le stockage en mémoire permet de vérifier ce qui est écrit, lu et supprimé.
const bucket = new Map<string, Buffer>();
let attemptCounter = 0;
vi.mock('@/lib/r2', async () => {
    const actual = await vi.importActual<typeof import('@/lib/r2')>('@/lib/r2');
    return {
    putObject: vi.fn(async (key: string, body: Buffer) => { bucket.set(key, body); }),
    getObject: vi.fn(async (key: string) => bucket.get(key) ?? null),
    deleteObject: vi.fn(async (key: string) => { bucket.delete(key); }),
    // Constructeurs de clés : vraies fonctions pures (rangement par UL et par nom de véhicule).
    expenseUlSegment: actual.expenseUlSegment,
    buildVehiclePhotoKey: actual.buildVehiclePhotoKey,
    buildVehicleGuideKey: actual.buildVehicleGuideKey,
    newAttemptId: () => `att${++attemptCounter}`,
    R2Error: class R2Error extends Error {},
    };
});

import { auth } from '@/auth';
import { deleteObject, putObject } from '@/lib/r2';
import { POST as postDocument } from '@/app/api/vehicles/[id]/documents/route';
import { GET as getDocument, DELETE as deleteDocument } from '@/app/api/vehicles/[id]/documents/[documentId]/route';
import { GET as getQrDocument } from '@/app/api/qr/[token]/documents/[documentId]/route';
import { GET as getVehicle, DELETE as deleteVehicle } from '@/app/api/vehicles/[id]/route';
import { GET as getQrVehicle } from '@/app/api/qr/[token]/vehicle/route';
import { db, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);

const VEHICLE = 'VPSP 182';
const OTHER_VEHICLE = 'VL 777';
const ADMIN = { user: { id: 'u-admin', email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } };
const ADMIN_OTHER_UL = { user: { id: 'u-admin-17', email: 'admin17@test.com', roles: ['ADMIN'], ulId: 'ul-paris-17' } };
const SUPER_ADMIN = { user: { id: 'u-sa', email: 'sa@test.com', roles: ['SUPER_ADMIN'], ulId: 'ul-paris-17' } };
const VOLUNTEER = { user: { id: 'u-chvl', email: 'chvl@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } };
const VOLUNTEER_OTHER_UL = { user: { id: 'u-chvl-17', email: 'chvl17@test.com', roles: ['CHVL'], ulId: 'ul-paris-17' } };
const INACTIVE = { user: { id: 'u-inactif', email: 'inactif@test.com', roles: ['INACTIF'], ulId: 'ul-paris-18' } };

const PDF = Buffer.from('%PDF-1.7\n% document de test\n%%EOF\n');

function asSession(s: unknown) {
    mockedAuth.mockResolvedValue(s as never);
}

function params(id = VEHICLE) {
    return { params: Promise.resolve({ id }) };
}

function docParams(documentId: string, id = VEHICLE) {
    return { params: Promise.resolve({ id, documentId }) };
}

function qrParams(documentId: string, token = 'qr-182') {
    return { params: Promise.resolve({ token, documentId }) };
}

function uploadRequest(body: Buffer | string, fileName = 'VPSP 182.pdf', type = 'application/pdf'): Request {
    const formData = new FormData();
    formData.append('file', new File([new Uint8Array(Buffer.from(body))], fileName, { type }));
    return new Request(`http://localhost/api/vehicles/${encodeURIComponent(VEHICLE)}/documents`, {
        method: 'POST',
        body: formData,
    });
}

function docRequest(query = '', method = 'GET'): Request {
    return new Request(`http://localhost/api/vehicles/${encodeURIComponent(VEHICLE)}/documents/x${query}`, { method });
}

/** Dépose un document par la route et renvoie son identifiant. */
async function upload(fileName = 'VPSP 182.pdf', body: Buffer = PDF): Promise<string> {
    asSession(ADMIN);
    const res = await postDocument(uploadRequest(body, fileName), params());
    expect(res.status).toBe(201);
    return (await res.json()).document.id as string;
}

async function documentRows(vehicleId = 'veh-182') {
    const res = await db.execute({
        sql: `SELECT id, vehicleId, r2Key, fileName, size, createdAt FROM VehicleDocument WHERE vehicleId = ? ORDER BY createdAt, id`,
        args: [vehicleId],
    });
    return res.rows;
}

beforeEach(async () => {
    bucket.clear();
    attemptCounter = 0;
    vi.mocked(deleteObject).mockClear();
    vi.mocked(putObject).mockClear();
    mockedAuth.mockReset();
    await db.execute(`DELETE FROM VehicleDocument`);
    await db.execute(`DELETE FROM Trip`);
    await db.execute(`DELETE FROM Vehicle`);
    await seedVehicle({ id: 'veh-182', name: VEHICLE, type: 'VPSP', qrToken: 'qr-182', ulId: 'ul-paris-18' });
    await seedVehicle({ id: 'veh-777', name: OTHER_VEHICLE, type: 'VL', qrToken: 'qr-777', ulId: 'ul-paris-18' });
});

describe('POST /api/vehicles/[id]/documents', () => {
    it('401 sans session', async () => {
        asSession(null);
        const res = await postDocument(uploadRequest(PDF), params());
        expect(res.status).toBe(401);
    });

    it('403 pour un non-administrateur (CHVL)', async () => {
        asSession(VOLUNTEER);
        const res = await postDocument(uploadRequest(PDF), params());
        expect(res.status).toBe(403);
        expect(bucket.size).toBe(0);
    });

    it("403 pour un administrateur d'une autre UL", async () => {
        asSession(ADMIN_OTHER_UL);
        const res = await postDocument(uploadRequest(PDF), params());
        expect(res.status).toBe(403);
        expect(bucket.size).toBe(0);
    });

    it('404 pour un véhicule inconnu', async () => {
        asSession(ADMIN);
        const res = await postDocument(uploadRequest(PDF), params('INCONNU'));
        expect(res.status).toBe(404);
    });

    it("400 pour un .pdf sans octets magiques %PDF — rien n'est écrit", async () => {
        asSession(ADMIN);
        const res = await postDocument(uploadRequest('pas un pdf'), params());
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('Le fichier doit être un PDF.');
        expect(bucket.size).toBe(0);
        expect(await documentRows()).toHaveLength(0);
    });

    it('400 pour une image', async () => {
        asSession(ADMIN);
        const res = await postDocument(uploadRequest(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'photo.png', 'image/png'), params());
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('Le fichier doit être un PDF.');
        expect(bucket.size).toBe(0);
    });

    it('400 sans fichier', async () => {
        asSession(ADMIN);
        const req = new Request('http://localhost/api/vehicles/x/documents', { method: 'POST', body: new FormData() });
        const res = await postDocument(req, params());
        expect(res.status).toBe(400);
    });

    it("413 pour un PDF de 5 Mo — rien n'est écrit", async () => {
        asSession(ADMIN);
        const big = Buffer.alloc(5 * 1024 * 1024, 0x20);
        PDF.copy(big);
        const res = await postDocument(uploadRequest(big), params());
        expect(res.status).toBe(413);
        expect((await res.json()).error).toContain('4 Mo maximum');
        expect(bucket.size).toBe(0);
        expect(await documentRows()).toHaveLength(0);
    });

    it('201 — enregistre le PDF dans R2 et ses métadonnées en base, sans clé R2 dans la réponse', async () => {
        asSession(ADMIN);
        const res = await postDocument(uploadRequest(PDF), params());
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.document).toMatchObject({ fileName: 'VPSP 182.pdf', size: PDF.length });
        expect(JSON.stringify(body)).not.toContain('vehicle-guides/');

        const rows = await documentRows();
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(body.document.id);
        expect(rows[0].r2Key).toBe('vehicle-documents/ul-paris-18/vpsp-182/att1.pdf');
        expect(rows[0].fileName).toBe('VPSP 182.pdf');
        expect(Number(rows[0].size)).toBe(PDF.length);
        expect(rows[0].createdAt).toBeTruthy();
        expect(bucket.get('vehicle-documents/ul-paris-18/vpsp-182/att1.pdf')?.equals(PDF)).toBe(true);
    });

    it("trois dépôts successifs donnent trois documents, sans remplacer les précédents", async () => {
        await upload('a.pdf');
        await upload('b.pdf');
        await upload('c.pdf');
        const rows = await documentRows();
        expect(rows.map(r => r.fileName).sort()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
        expect(new Set(rows.map(r => r.r2Key)).size).toBe(3);
        expect(bucket.size).toBe(3);
        expect(deleteObject).not.toHaveBeenCalled();
    });

    it('SUPER_ADMIN peut déposer sur un véhicule de toute UL', async () => {
        asSession(SUPER_ADMIN);
        const res = await postDocument(uploadRequest(PDF), params());
        expect(res.status).toBe(201);
    });

    it("si l'écriture en base échoue, l'objet R2 est nettoyé", async () => {
        asSession(ADMIN);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        // Table absente : l'INSERT échoue après l'écriture R2.
        await db.execute(`ALTER TABLE VehicleDocument RENAME TO VehicleDocument_tmp`);
        try {
            const res = await postDocument(uploadRequest(PDF), params());
            expect(res.status).toBe(500);
            expect(bucket.size).toBe(0);
            expect(deleteObject).toHaveBeenCalledWith('vehicle-documents/ul-paris-18/vpsp-182/att1.pdf');
        } finally {
            await db.execute(`ALTER TABLE VehicleDocument_tmp RENAME TO VehicleDocument`);
            errorSpy.mockRestore();
        }
    });
});

describe('GET /api/vehicles/[id]/documents/[documentId]', () => {
    let docId: string;
    beforeEach(async () => {
        docId = await upload();
    });

    it('401 sans session', async () => {
        asSession(null);
        const res = await getDocument(docRequest(), docParams(docId));
        expect(res.status).toBe(401);
    });

    it('lecture inline par un bénévole de la même UL', async () => {
        asSession(VOLUNTEER);
        const res = await getDocument(docRequest(), docParams(docId));
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
        expect(res.headers.get('Content-Disposition')).toMatch(/^inline; filename="VPSP 182.pdf"/);
        expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
    });

    it("téléchargement avec ?download=1 sous le nom d'origine", async () => {
        asSession(VOLUNTEER);
        const res = await getDocument(docRequest('?download=1'), docParams(docId));
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="VPSP 182.pdf"/);
    });

    it('403 pour un compte INACTIF de la même UL', async () => {
        asSession(INACTIVE);
        const res = await getDocument(docRequest(), docParams(docId));
        expect(res.status).toBe(403);
    });

    it("404 pour un bénévole d'une autre UL", async () => {
        asSession(VOLUNTEER_OTHER_UL);
        const res = await getDocument(docRequest(), docParams(docId));
        expect(res.status).toBe(404);
    });

    it('404 pour un document inconnu', async () => {
        asSession(VOLUNTEER);
        const res = await getDocument(docRequest(), docParams('inconnu'));
        expect(res.status).toBe(404);
    });

    it("404 pour le document d'un autre véhicule, même UL", async () => {
        asSession(ADMIN);
        const otherRes = await postDocument(
            new Request('http://localhost/api/vehicles/x/documents', {
                method: 'POST',
                body: (() => { const f = new FormData(); f.append('file', new File([new Uint8Array(PDF)], 'autre.pdf', { type: 'application/pdf' })); return f; })(),
            }),
            params(OTHER_VEHICLE),
        );
        const otherId = (await otherRes.json()).document.id as string;

        asSession(VOLUNTEER);
        const res = await getDocument(docRequest(), docParams(otherId, VEHICLE));
        expect(res.status).toBe(404);
    });

    it('409 si la clé en base est absente du bucket', async () => {
        bucket.clear();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        asSession(VOLUNTEER);
        const res = await getDocument(docRequest(), docParams(docId));
        expect(res.status).toBe(409);
        errorSpy.mockRestore();
    });
});

describe('DELETE /api/vehicles/[id]/documents/[documentId]', () => {
    let docId: string;
    let secondId: string;
    beforeEach(async () => {
        docId = await upload('un.pdf');
        secondId = await upload('deux.pdf');
    });

    it('401 sans session', async () => {
        asSession(null);
        const res = await deleteDocument(docRequest('', 'DELETE'), docParams(docId));
        expect(res.status).toBe(401);
    });

    it('403 pour un non-administrateur', async () => {
        asSession(VOLUNTEER);
        const res = await deleteDocument(docRequest('', 'DELETE'), docParams(docId));
        expect(res.status).toBe(403);
        expect(await documentRows()).toHaveLength(2);
    });

    it("403 pour un administrateur d'une autre UL", async () => {
        asSession(ADMIN_OTHER_UL);
        const res = await deleteDocument(docRequest('', 'DELETE'), docParams(docId));
        expect(res.status).toBe(403);
        expect(await documentRows()).toHaveLength(2);
    });

    it('404 pour un document inconnu', async () => {
        asSession(ADMIN);
        const res = await deleteDocument(docRequest('', 'DELETE'), docParams('inconnu'));
        expect(res.status).toBe(404);
    });

    it("404 pour le document d'un autre véhicule — il n'est pas supprimé", async () => {
        asSession(ADMIN);
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(PDF)], 'autre.pdf', { type: 'application/pdf' }));
        const otherRes = await postDocument(new Request('http://localhost/x', { method: 'POST', body: formData }), params(OTHER_VEHICLE));
        const otherId = (await otherRes.json()).document.id as string;

        const res = await deleteDocument(docRequest('', 'DELETE'), docParams(otherId, VEHICLE));
        expect(res.status).toBe(404);
        expect(await documentRows('veh-777')).toHaveLength(1);
    });

    it('retrait — ligne et objet supprimés, les autres documents restent', async () => {
        asSession(ADMIN);
        const res = await deleteDocument(docRequest('', 'DELETE'), docParams(docId));
        expect(res.status).toBe(200);

        const rows = await documentRows();
        expect(rows.map(r => r.id)).toEqual([secondId]);
        expect(bucket.size).toBe(1);
        expect(bucket.has('vehicle-documents/ul-paris-18/vpsp-182/att2.pdf')).toBe(true);
    });

    it("un échec de suppression R2 est journalisé mais n'est pas une erreur", async () => {
        asSession(ADMIN);
        vi.mocked(deleteObject).mockRejectedValueOnce(new Error('R2 indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const res = await deleteDocument(docRequest('', 'DELETE'), docParams(docId));
        expect(res.status).toBe(200);
        expect(await documentRows()).toHaveLength(1);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("retrait d'un ancien guide repris — les colonnes guide* sont remises à NULL", async () => {
        await db.execute({
            sql: `UPDATE Vehicle SET guideR2Key = ?, guideFileName = 'un.pdf', guideSize = 10, guideUpdatedAt = 'x' WHERE id = 'veh-182'`,
            args: ['vehicle-documents/ul-paris-18/vpsp-182/att1.pdf'],
        });
        asSession(ADMIN);
        const res = await deleteDocument(docRequest('', 'DELETE'), docParams(docId));
        expect(res.status).toBe(200);

        const row = (await db.execute(`SELECT guideR2Key, guideFileName, guideSize, guideUpdatedAt FROM Vehicle WHERE id = 'veh-182'`)).rows[0];
        expect(row.guideR2Key).toBeNull();
        expect(row.guideFileName).toBeNull();
        expect(row.guideSize).toBeNull();
        expect(row.guideUpdatedAt).toBeNull();
    });

    it('retirer un autre document laisse les colonnes guide* intactes', async () => {
        await db.execute({
            sql: `UPDATE Vehicle SET guideR2Key = ?, guideFileName = 'un.pdf' WHERE id = 'veh-182'`,
            args: ['vehicle-documents/ul-paris-18/vpsp-182/att1.pdf'],
        });
        asSession(ADMIN);
        await deleteDocument(docRequest('', 'DELETE'), docParams(secondId));
        const row = (await db.execute(`SELECT guideR2Key FROM Vehicle WHERE id = 'veh-182'`)).rows[0];
        expect(row.guideR2Key).toBe('vehicle-documents/ul-paris-18/vpsp-182/att1.pdf');
    });
});

describe('GET /api/qr/[token]/documents/[documentId]', () => {
    let docId: string;
    beforeEach(async () => {
        docId = await upload();
    });

    function qrRequest(query = '') {
        return new Request(`http://localhost/api/qr/qr-182/documents/x${query}`);
    }

    it('401 sans session', async () => {
        asSession(null);
        const res = await getQrDocument(qrRequest(), qrParams(docId));
        expect(res.status).toBe(401);
    });

    it('403 pour un compte INACTIF', async () => {
        asSession(INACTIVE);
        const res = await getQrDocument(qrRequest(), qrParams(docId));
        expect(res.status).toBe(403);
    });

    it("lecture par un bénévole d'une autre UL (bypass QR)", async () => {
        asSession(VOLUNTEER_OTHER_UL);
        const res = await getQrDocument(qrRequest(), qrParams(docId));
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Disposition')).toMatch(/^inline; /);
        expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
    });

    it('téléchargement avec ?download=1', async () => {
        asSession(VOLUNTEER_OTHER_UL);
        const res = await getQrDocument(qrRequest('?download=1'), qrParams(docId));
        expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="VPSP 182.pdf"/);
    });

    it('404 pour un token inconnu', async () => {
        asSession(VOLUNTEER);
        const res = await getQrDocument(qrRequest(), qrParams(docId, 'inconnu'));
        expect(res.status).toBe(404);
    });

    it('404 pour un document inconnu', async () => {
        asSession(VOLUNTEER);
        const res = await getQrDocument(qrRequest(), qrParams('inconnu'));
        expect(res.status).toBe(404);
    });

    it("404 : le jeton QR d'un véhicule n'ouvre jamais le document d'un autre véhicule", async () => {
        asSession(ADMIN);
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(Buffer.from('%PDF-1.7 secret'))], 'secret.pdf', { type: 'application/pdf' }));
        const otherRes = await postDocument(new Request('http://localhost/x', { method: 'POST', body: formData }), params(OTHER_VEHICLE));
        const otherId = (await otherRes.json()).document.id as string;

        asSession(VOLUNTEER_OTHER_UL);
        const res = await getQrDocument(qrRequest(), qrParams(otherId, 'qr-182'));
        expect(res.status).toBe(404);
        // Le même identifiant s'ouvre avec le jeton de SON véhicule.
        const ok = await getQrDocument(qrRequest(), qrParams(otherId, 'qr-777'));
        expect(ok.status).toBe(200);
    });
});

describe('Métadonnées des documents dans les fiches véhicule', () => {
    it('GET /api/vehicles/[id] expose la liste des documents — jamais la clé R2', async () => {
        const first = await upload('un.pdf');
        const second = await upload('deux.pdf');
        asSession(VOLUNTEER);
        const res = await getVehicle(new Request('http://localhost/api/vehicles/x'), params());
        const body = await res.json();
        expect(body.documents.map((d: { id: string }) => d.id).sort()).toEqual([first, second].sort());
        expect(body.documents[0]).toEqual({
            id: expect.any(String),
            fileName: expect.any(String),
            size: PDF.length,
            createdAt: expect.any(String),
        });
        expect(JSON.stringify(body)).not.toContain('vehicle-guides/');
        expect(body).not.toHaveProperty('guideFileName');
    });

    it("GET /api/vehicles/[id] renvoie une liste vide sans document", async () => {
        asSession(VOLUNTEER);
        const res = await getVehicle(new Request('http://localhost/api/vehicles/x'), params());
        expect((await res.json()).documents).toEqual([]);
    });

    it("GET /api/vehicles/[id] n'expose pas les documents d'un autre véhicule", async () => {
        asSession(ADMIN);
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(PDF)], 'autre.pdf', { type: 'application/pdf' }));
        await postDocument(new Request('http://localhost/x', { method: 'POST', body: formData }), params(OTHER_VEHICLE));
        asSession(VOLUNTEER);
        const res = await getVehicle(new Request('http://localhost/api/vehicles/x'), params());
        expect((await res.json()).documents).toEqual([]);
    });

    it('GET /api/qr/[token]/vehicle expose les métadonnées — jamais la clé R2', async () => {
        await upload('un.pdf');
        asSession(VOLUNTEER_OTHER_UL);
        const res = await getQrVehicle(new Request('http://localhost/api/qr/qr-182/vehicle'), { params: Promise.resolve({ token: 'qr-182' }) });
        const body = await res.json();
        expect(body.documents).toHaveLength(1);
        expect(body.documents[0].fileName).toBe('un.pdf');
        expect(JSON.stringify(body)).not.toContain('vehicle-guides/');
    });
});

describe('DELETE /api/vehicles/[id] — nettoyage des documents', () => {
    const deleteRequest = () => new Request('http://localhost/api/vehicles/x', { method: 'DELETE' });

    it('supprime les lignes et les N objets du bucket', async () => {
        await upload('a.pdf');
        await upload('b.pdf');
        await upload('c.pdf');
        expect(bucket.size).toBe(3);

        asSession(ADMIN);
        const res = await deleteVehicle(deleteRequest(), params());
        expect(res.status).toBe(200);
        expect(bucket.size).toBe(0);
        expect(await documentRows()).toHaveLength(0);
        expect(deleteObject).toHaveBeenCalledWith('vehicle-documents/ul-paris-18/vpsp-182/att1.pdf');
        expect(deleteObject).toHaveBeenCalledWith('vehicle-documents/ul-paris-18/vpsp-182/att2.pdf');
        expect(deleteObject).toHaveBeenCalledWith('vehicle-documents/ul-paris-18/vpsp-182/att3.pdf');
    });

    it("ne touche pas aux documents d'un autre véhicule", async () => {
        await upload('a.pdf');
        asSession(ADMIN);
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(PDF)], 'autre.pdf', { type: 'application/pdf' }));
        await postDocument(new Request('http://localhost/x', { method: 'POST', body: formData }), params(OTHER_VEHICLE));

        const res = await deleteVehicle(deleteRequest(), params());
        expect(res.status).toBe(200);
        expect(await documentRows('veh-777')).toHaveLength(1);
        expect(bucket.size).toBe(1);
    });

    it('répond 200 même si la suppression R2 échoue', async () => {
        await upload('a.pdf');
        asSession(ADMIN);
        vi.mocked(deleteObject).mockRejectedValueOnce(new Error('R2 indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const res = await deleteVehicle(deleteRequest(), params());
        expect(res.status).toBe(200);
        expect((await db.execute(`SELECT id FROM Vehicle WHERE id = 'veh-182'`)).rows).toHaveLength(0);
        expect(await documentRows()).toHaveLength(0);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("une erreur base sur les documents ne fait pas échouer la suppression et n'empêche pas le nettoyage de la photo", async () => {
        await upload('a.pdf');
        await db.execute(`UPDATE Vehicle SET photoR2Key = 'vehicle-photos/veh-182/p1.jpg' WHERE id = 'veh-182'`);
        bucket.set('vehicle-photos/veh-182/p1.jpg', Buffer.from('jpg'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        // Table absente : la lecture des documents échoue après la suppression du véhicule.
        await db.execute(`ALTER TABLE VehicleDocument RENAME TO VehicleDocument_tmp`);
        try {
            asSession(ADMIN);
            const res = await deleteVehicle(deleteRequest(), params());
            expect(res.status).toBe(200);
            expect((await db.execute(`SELECT id FROM Vehicle WHERE id = 'veh-182'`)).rows).toHaveLength(0);
            expect(deleteObject).toHaveBeenCalledWith('vehicle-photos/veh-182/p1.jpg');
            expect(bucket.has('vehicle-photos/veh-182/p1.jpg')).toBe(false);
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('nettoyage des documents du véhicule veh-182 impossible'),
                expect.any(String),
            );
        } finally {
            await db.execute(`ALTER TABLE VehicleDocument_tmp RENAME TO VehicleDocument`);
            errorSpy.mockRestore();
        }
    });

    it("n'appelle pas R2 pour un véhicule sans document", async () => {
        asSession(ADMIN);
        const res = await deleteVehicle(deleteRequest(), params());
        expect(res.status).toBe(200);
        expect(deleteObject).not.toHaveBeenCalled();
    });
});

describe('POST /api/vehicles/[id]/documents — rangement par UL', () => {
    const SLUG_VEHICLE = 'VSAV 1';
    const slugUpload = () => {
        const formData = new FormData();
        formData.append('file', new File([new Uint8Array(PDF)], 'Guide.pdf', { type: 'application/pdf' }));
        return new Request(`http://localhost/api/vehicles/${encodeURIComponent(SLUG_VEHICLE)}/documents`, { method: 'POST', body: formData });
    };

    it("slug ≠ id : la clé porte le slug de l'UL et le nom assaini du véhicule ; supprimée avec le véhicule", async () => {
        await db.execute(`INSERT OR REPLACE INTO "UniteLocale" (id, name, slug) VALUES ('ul-uuid-900', 'Paris XVIII', 'paris-xviii')`);
        await seedVehicle({ id: 'veh-900', name: SLUG_VEHICLE, type: 'VSAV', qrToken: 'qr-900', ulId: 'ul-uuid-900' });
        asSession(SUPER_ADMIN);
        expect((await postDocument(slugUpload(), params(SLUG_VEHICLE))).status).toBe(201);
        const [row] = await documentRows('veh-900');
        expect(row.r2Key).toBe('vehicle-documents/paris-xviii/vsav-1/att1.pdf');
        expect(bucket.has(row.r2Key as string)).toBe(true);

        const res = await deleteVehicle(new Request('http://localhost/api/vehicles/x', { method: 'DELETE' }), params(SLUG_VEHICLE));
        expect(res.status).toBe(200);
        expect(bucket.has(row.r2Key as string)).toBe(false);
    });

    it.each([null, 'default'])("400 si le véhicule n'a pas d'UL (%s), rien n'est écrit", async (ulId) => {
        await seedVehicle({ id: 'veh-901', name: SLUG_VEHICLE, type: 'VSAV', qrToken: 'qr-901', ulId });
        asSession(SUPER_ADMIN);
        const res = await postDocument(slugUpload(), params(SLUG_VEHICLE));
        expect(res.status).toBe(400);
        expect(putObject).not.toHaveBeenCalled();
        expect(await documentRows('veh-901')).toHaveLength(0);
    });
});
