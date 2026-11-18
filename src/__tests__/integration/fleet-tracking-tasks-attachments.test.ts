// @vitest-environment node
// Environnement node : la route lit un `multipart/form-data` via `Request.formData()`
// (undici) ; les `File`/`FormData` de jsdom seraient rejetés.
/**
 * Tests d'intégration — pièces jointes des tâches du suivi technique :
 *   POST   /api/fleet-tracking/tasks/[id]/attachments
 *   GET    /api/fleet-tracking/tasks/[id]/attachments/[attachmentId]
 *   DELETE /api/fleet-tracking/tasks/[id]/attachments/[attachmentId]
 *
 * PDF/JPEG/PNG/WebP vérifiés par signature, 4 Mo au plus (413), rangés sur R2 sous
 * `fleet-tracking/<UL>/tasks/<taskId>/`, lisibles par les responsables de l'UL seulement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

const bucket = new Map<string, Buffer>();
vi.mock('@/lib/r2', async () => {
    const actual = await vi.importActual<typeof import('@/lib/r2')>('@/lib/r2');
    return {
        putObject: vi.fn(async (key: string, body: Buffer) => { bucket.set(key, body); }),
        getObject: vi.fn(async (key: string) => bucket.get(key) ?? null),
        deleteObject: vi.fn(async (key: string) => { bucket.delete(key); }),
        expenseUlSegment: actual.expenseUlSegment,
    };
});

import { POST as upload } from '@/app/api/fleet-tracking/tasks/[id]/attachments/route';
import { GET as readAttachment, DELETE as deleteAttachment } from '@/app/api/fleet-tracking/tasks/[id]/attachments/[attachmentId]/route';
import { GET as getTask } from '@/app/api/fleet-tracking/tasks/[id]/route';
import { auth } from '@/auth';
import { deleteObject, putObject } from '@/lib/r2';
import { db, seedUniteLocale, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);
const mockedPut = vi.mocked(putObject);
const mockedDelete = vi.mocked(deleteObject);

const session = (roles: string[], ulId: string, id: string) =>
    ({ user: { id, email: `${id}@test.com`, name: `Nom ${id}`, ulId, roles } }) as never;
const RESP_A = session(['RESP_VEHICULE'], 'ul-a', 'u-resp-a');
const ADMIN_A = session(['ADMIN'], 'ul-a', 'u-admin-a');
const ADMIN_B = session(['ADMIN'], 'ul-b', 'u-admin-b');
const CHVL_A = session(['CHVL'], 'ul-a', 'u-chvl-a');

const TASK = 'task-a';
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(1024 * 1024)]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const EXE = Buffer.from('MZ\x90\x00 programme');

function uploadRequest(body: Buffer, fileName = 'devis.pdf', type = 'application/pdf'): Request {
    const formData = new FormData();
    formData.append('file', new File([new Uint8Array(body)], fileName, { type }));
    return new Request(`http://localhost/api/fleet-tracking/tasks/${TASK}/attachments`, { method: 'POST', body: formData });
}
const taskParams = (id = TASK) => ({ params: Promise.resolve({ id }) });
const attParams = (attachmentId: string, id = TASK) => ({ params: Promise.resolve({ id, attachmentId }) });
const getReq = (qs = '') => new Request(`http://localhost/api/fleet-tracking/tasks/${TASK}/attachments/x${qs}`);

async function uploadAs(s: unknown, body: Buffer, fileName?: string, type?: string) {
    mockedAuth.mockResolvedValue(s as never);
    const res = await upload(uploadRequest(body, fileName, type), taskParams());
    return { res, json: await res.json() as { attachment?: { id: string; fileName: string; contentType: string }; error?: string } };
}

beforeEach(async () => {
    mockedAuth.mockReset();
    mockedPut.mockClear();
    mockedDelete.mockClear();
    bucket.clear();
    await seedUniteLocale({ id: 'ul-a', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-b', name: 'Paris 15', slug: 'paris-15' });
    await seedUser({ id: 'u-resp-a', email: 'resp-a@test.com', name: 'Camille Roux' });
    await db.execute({
        sql: `INSERT INTO "FleetTask" (id, ulId, title, status, priority, pinned, createdAt, updatedAt) VALUES (?, 'ul-a', 'Devis', 'TODO', 'NORMAL', 0, 't', 't')`,
        args: [TASK],
    });
});

describe('dépôt', () => {
    it('401 sans session, 403 pour un CHVL ou une autre UL, 404 tâche inconnue', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await upload(uploadRequest(PDF), taskParams())).status).toBe(401);
        expect((await uploadAs(CHVL_A, PDF)).res.status).toBe(403);
        expect((await uploadAs(ADMIN_B, PDF)).res.status).toBe(403);
        mockedAuth.mockResolvedValue(RESP_A);
        expect((await upload(uploadRequest(PDF), taskParams('absente'))).status).toBe(404);
        expect(mockedPut).not.toHaveBeenCalled();
    });

    it('PDF de 1 Mo : 201, rangé sous fleet-tracking/<UL>/tasks/<taskId>/, ligne en base', async () => {
        const { res, json } = await uploadAs(RESP_A, PDF, 'Devis MVR.pdf');
        expect(res.status).toBe(201);
        expect(json.attachment!.fileName).toBe('Devis MVR.pdf');
        expect(json.attachment!.contentType).toBe('application/pdf');
        const [key] = [...bucket.keys()];
        expect(key).toBe(`fleet-tracking/paris-18/tasks/${TASK}/${json.attachment!.id}.pdf`);
        const row = (await db.execute({ sql: `SELECT * FROM "FleetAttachment" WHERE id = ?`, args: [json.attachment!.id] })).rows[0];
        expect(row.ownerType).toBe('TASK');
        expect(row.ownerId).toBe(TASK);
        expect(row.ulId).toBe('ul-a');
        expect(row.size).toBe(PDF.length);
        expect(row.uploadedBy).toBe('u-resp-a');
    });

    it('image PNG annoncée avec un mauvais nom : type réel retenu', async () => {
        const { res, json } = await uploadAs(RESP_A, PNG, 'photo.jpeg', 'image/jpeg');
        expect(res.status).toBe(201);
        expect(json.attachment!.contentType).toBe('image/png');
        expect(json.attachment!.fileName).toBe('photo.png');
    });

    it('.exe renommé .pdf : 400 ; 5 Mo : 413 ; rien n\'est écrit sur R2', async () => {
        expect((await uploadAs(RESP_A, EXE, 'devis.pdf')).res.status).toBe(400);
        const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(5 * 1024 * 1024)]);
        expect((await uploadAs(RESP_A, big)).res.status).toBe(413);
        expect(mockedPut).not.toHaveBeenCalled();
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetAttachment"`)).rows[0].n).toBe(0);
    });

    it('« Devis v2.1.pdf » garde son « .1 »', async () => {
        const { json } = await uploadAs(RESP_A, PDF, 'Devis v2.1.pdf');
        expect(json.attachment!.fileName).toBe('Devis v2.1.pdf');
    });

    it('au-delà de 20 pièces jointes par tâche : 400, rien n\'est écrit sur R2', async () => {
        for (let i = 0; i < 20; i++) {
            await db.execute({
                sql: `INSERT INTO "FleetAttachment" (id, ownerType, ownerId, ulId, r2Key, fileName, contentType, size, createdAt)
                      VALUES (?, 'TASK', ?, 'ul-a', ?, 'f.pdf', 'application/pdf', 1, 't')`,
                args: [`pre-${i}`, TASK, `k-${i}`],
            });
        }
        const { res, json } = await uploadAs(RESP_A, PDF);
        expect(res.status).toBe(400);
        expect(json.error).toMatch(/20 pièces jointes/);
        expect(mockedPut).not.toHaveBeenCalled();
    });

    it('400 sans fichier', async () => {
        mockedAuth.mockResolvedValue(RESP_A);
        const formData = new FormData();
        formData.append('autre', 'x');
        const res = await upload(new Request('http://localhost/x', { method: 'POST', body: formData }), taskParams());
        expect(res.status).toBe(400);
    });

    it('échec d\'insertion en base : l\'objet R2 est nettoyé', async () => {
        // L'insertion échoue (le comptage préalable, lui, fonctionne).
        await db.execute(`CREATE TRIGGER "fail_attachment_insert" BEFORE INSERT ON "FleetAttachment" BEGIN SELECT RAISE(ABORT, 'insertion refusée'); END`);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const { res } = await uploadAs(RESP_A, PDF);
            expect(res.status).toBe(500);
            expect(bucket.size).toBe(0);
            expect(mockedDelete).toHaveBeenCalledTimes(1);
        } finally {
            errorSpy.mockRestore();
            await db.execute(`DROP TRIGGER "fail_attachment_insert"`);
        }
    });
});

describe('lecture et suppression', () => {
    it('lisible inline par un responsable de l\'UL, téléchargeable ; 403 pour une autre UL', async () => {
        const { json } = await uploadAs(RESP_A, PDF, 'Devis été.pdf');
        const id = json.attachment!.id;

        mockedAuth.mockResolvedValue(ADMIN_A);
        const res = await readAttachment(getReq(), attParams(id));
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
        expect(res.headers.get('Content-Disposition')).toMatch(/^inline;/);
        expect(res.headers.get('Content-Security-Policy')).toMatch(/^sandbox; default-src 'none'/);
        expect(res.headers.get('Content-Disposition')).toContain("filename*=UTF-8''Devis%20%C3%A9t%C3%A9.pdf");
        expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
        const dl = await readAttachment(getReq('?download=1'), attParams(id));
        expect(dl.headers.get('Content-Disposition')).toMatch(/^attachment;/);

        mockedAuth.mockResolvedValue(ADMIN_B);
        expect((await readAttachment(getReq(), attParams(id))).status).toBe(403);
        expect((await deleteAttachment(getReq(), attParams(id))).status).toBe(403);
        mockedAuth.mockResolvedValue(CHVL_A);
        expect((await readAttachment(getReq(), attParams(id))).status).toBe(403);
        mockedAuth.mockResolvedValue(null as never);
        expect((await readAttachment(getReq(), attParams(id))).status).toBe(401);
    });

    it('404 si la pièce jointe n\'appartient pas à cette tâche', async () => {
        const { json } = await uploadAs(RESP_A, PDF);
        mockedAuth.mockResolvedValue(RESP_A);
        expect((await readAttachment(getReq(), attParams(json.attachment!.id, 'autre-tache'))).status).toBe(404);
        expect((await readAttachment(getReq(), attParams('inconnue'))).status).toBe(404);
    });

    it('le détail de la tâche liste la pièce jointe et son déposant', async () => {
        await uploadAs(RESP_A, PDF, 'devis.pdf');
        mockedAuth.mockResolvedValue(ADMIN_A);
        const res = await getTask(getReq(), taskParams());
        const task = (await res.json() as { task: { attachmentCount: number; attachments: { fileName: string; uploadedByName: string }[] } }).task;
        expect(task.attachmentCount).toBe(1);
        expect(task.attachments[0]).toMatchObject({ fileName: 'devis.pdf', uploadedByName: 'Camille Roux' });
    });

    it('suppression : objet R2 et ligne retirés', async () => {
        const { json } = await uploadAs(RESP_A, PDF);
        mockedAuth.mockResolvedValue(ADMIN_A);
        const res = await deleteAttachment(new Request('http://localhost/x', { method: 'DELETE' }), attParams(json.attachment!.id));
        expect(res.status).toBe(200);
        expect(bucket.size).toBe(0);
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetAttachment"`)).rows[0].n).toBe(0);
    });

    it('suppression avec échec R2 : 200, la ligne disparaît quand même (échec journalisé)', async () => {
        const { json } = await uploadAs(RESP_A, PDF);
        mockedDelete.mockRejectedValueOnce(new Error('R2 indisponible'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockedAuth.mockResolvedValue(ADMIN_A);
        const res = await deleteAttachment(new Request('http://localhost/x', { method: 'DELETE' }), attParams(json.attachment!.id));
        expect(res.status).toBe(200);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
        expect((await db.execute(`SELECT COUNT(*) AS n FROM "FleetAttachment"`)).rows[0].n).toBe(0);
        // L'objet reste orphelin sur R2 (inoffensif) ; un second DELETE répond 404.
        expect((await deleteAttachment(new Request('http://localhost/x', { method: 'DELETE' }), attParams(json.attachment!.id))).status).toBe(404);
    });
});
