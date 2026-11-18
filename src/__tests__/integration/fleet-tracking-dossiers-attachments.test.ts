// @vitest-environment node
// Environnement node : la route lit un `multipart/form-data` via `Request.formData()`
// (undici) ; les `File`/`FormData` de jsdom seraient rejetés.
/**
 * Tests d'intégration — pièces jointes des dossiers du suivi technique :
 *   POST   /api/fleet-tracking/dossiers/[id]/attachments
 *   GET    /api/fleet-tracking/dossiers/[id]/attachments/[attachmentId]
 *   DELETE /api/fleet-tracking/dossiers/[id]/attachments/[attachmentId]
 *
 * Mêmes règles que les tâches ; R2 sous `fleet-tracking/<UL>/dossiers/<dossierId>/` ;
 * retirer une PJ désignée par une pièce à récupérer la lui retire (la pièce reste reçue).
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

import { POST as upload } from '@/app/api/fleet-tracking/dossiers/[id]/attachments/route';
import { GET as readAttachment, DELETE as deleteAttachment } from '@/app/api/fleet-tracking/dossiers/[id]/attachments/[attachmentId]/route';
import { GET as readTaskAttachment } from '@/app/api/fleet-tracking/tasks/[id]/attachments/[attachmentId]/route';
import { auth } from '@/auth';
import { putObject } from '@/lib/r2';
import { db, seedUniteLocale, seedUser, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);
const mockedPut = vi.mocked(putObject);

const session = (roles: string[], ulId: string, id: string) =>
    ({ user: { id, email: `${id}@test.com`, name: `Nom ${id}`, ulId, roles } }) as never;
const RESP_A = session(['RESP_VEHICULE'], 'ul-a', 'u-resp-a');
const ADMIN_B = session(['ADMIN'], 'ul-b', 'u-admin-b');
const CHVL_A = session(['CHVL'], 'ul-a', 'u-chvl-a');

const DOSSIER = 'dossier-a';
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(1024)]);
const EXE = Buffer.from('MZ\x90\x00 programme');

function uploadRequest(body: Buffer, fileName = 'constat.pdf', type = 'application/pdf'): Request {
    const formData = new FormData();
    formData.append('file', new File([new Uint8Array(body)], fileName, { type }));
    return new Request(`http://localhost/api/fleet-tracking/dossiers/${DOSSIER}/attachments`, { method: 'POST', body: formData });
}
const dossierParams = (id = DOSSIER) => ({ params: Promise.resolve({ id }) });
const attParams = (attachmentId: string, id = DOSSIER) => ({ params: Promise.resolve({ id, attachmentId }) });
const getReq = () => new Request(`http://localhost/api/fleet-tracking/dossiers/${DOSSIER}/attachments/x`);

async function uploadAs(s: unknown, body: Buffer, fileName?: string) {
    mockedAuth.mockResolvedValue(s as never);
    const res = await upload(uploadRequest(body, fileName), dossierParams());
    return { res, json: await res.json() as { attachment?: { id: string; fileName: string }; error?: string } };
}

beforeEach(async () => {
    mockedAuth.mockReset();
    mockedPut.mockClear();
    bucket.clear();
    await seedUniteLocale({ id: 'ul-a', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-b', name: 'Paris 15', slug: 'paris-15' });
    await seedUser({ id: 'u-resp-a', email: 'resp-a@test.com', name: 'Camille Roux' });
    await seedVehicle({ id: 'veh-a', name: '75-188', plate: 'GV-114-QM', ulId: 'ul-a' });
    await db.execute({
        sql: `INSERT INTO "FleetDossier" (id, ulId, vehicleId, title, status, pinned, createdAt, updatedAt) VALUES (?, 'ul-a', 'veh-a', 'Sinistre', 'OPEN', 0, 't', 't')`,
        args: [DOSSIER],
    });
});

describe('pièces jointes de dossier', () => {
    it('401 sans session, 403 CHVL ou autre UL, 404 dossier inconnu', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await upload(uploadRequest(PDF), dossierParams())).status).toBe(401);
        expect((await uploadAs(CHVL_A, PDF)).res.status).toBe(403);
        expect((await uploadAs(ADMIN_B, PDF)).res.status).toBe(403);
        mockedAuth.mockResolvedValue(RESP_A);
        expect((await upload(uploadRequest(PDF), dossierParams('nope'))).status).toBe(404);
        expect(mockedPut).not.toHaveBeenCalled();
    });

    it('201 : rangée sous fleet-tracking/<UL>/dossiers/<id>/, lisible par l\'UL, 403 pour une autre UL', async () => {
        const { res, json } = await uploadAs(RESP_A, PDF);
        expect(res.status).toBe(201);
        const id = json.attachment!.id;
        const row = (await db.execute({ sql: `SELECT * FROM "FleetAttachment" WHERE id = ?`, args: [id] })).rows[0];
        expect(row).toMatchObject({ ownerType: 'DOSSIER', ownerId: DOSSIER, ulId: 'ul-a', r2Key: `fleet-tracking/paris-18/dossiers/${DOSSIER}/${id}.pdf` });

        const read = await readAttachment(getReq(), attParams(id));
        expect(read.status).toBe(200);
        expect(read.headers.get('Content-Type')).toBe('application/pdf');
        expect(read.headers.get('Content-Security-Policy')).toMatch(/sandbox/);

        mockedAuth.mockResolvedValue(ADMIN_B);
        expect((await readAttachment(getReq(), attParams(id))).status).toBe(403);
        expect((await deleteAttachment(getReq(), attParams(id))).status).toBe(403);
        // Une PJ de dossier n'est pas lisible par la route des tâches.
        mockedAuth.mockResolvedValue(RESP_A);
        expect((await readTaskAttachment(getReq(), attParams(id, DOSSIER))).status).toBe(404);
    });

    it('21e pièce jointe → 400 avec le message des dossiers, rien sur R2', async () => {
        for (let i = 0; i < 20; i++) {
            await db.execute({
                sql: `INSERT INTO "FleetAttachment" (id, ownerType, ownerId, ulId, r2Key, fileName, contentType, size, createdAt)
                      VALUES (?, 'DOSSIER', ?, 'ul-a', ?, 'a.pdf', 'application/pdf', 10, 't')`,
                args: [`att-${i}`, DOSSIER, `k-${i}`],
            });
        }
        const { res, json } = await uploadAs(RESP_A, PDF);
        expect(res.status).toBe(400);
        expect(json.error).toBe('Un dossier compte au plus 20 pièces jointes.');
        expect(mockedPut).not.toHaveBeenCalled();
        expect(bucket.size).toBe(0);
    });

    it('fichier refusé (.exe renommé) → 400, trop gros → 413, rien sur R2', async () => {
        expect((await uploadAs(RESP_A, EXE, 'devis.pdf')).res.status).toBe(400);
        const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4 * 1024 * 1024 + 1)]);
        expect((await uploadAs(RESP_A, big)).res.status).toBe(413);
        expect(mockedPut).not.toHaveBeenCalled();
    });

    it('suppression : ligne et objet R2 retirés ; la pièce à récupérer garde son état, perd le fichier', async () => {
        const { json } = await uploadAs(RESP_A, PDF);
        const id = json.attachment!.id;
        await db.execute({
            sql: `INSERT INTO "FleetDossierItem" (id, dossierId, label, received, attachmentId, receivedAt, position, createdAt)
                  VALUES ('item-1', ?, 'Constat', 1, ?, 't', 0, 't')`,
            args: [DOSSIER, id],
        });
        expect(bucket.size).toBe(1);
        const res = await deleteAttachment(getReq(), attParams(id));
        expect(res.status).toBe(200);
        expect(bucket.size).toBe(0);
        const item = (await db.execute(`SELECT received, attachmentId FROM "FleetDossierItem" WHERE id = 'item-1'`)).rows[0];
        expect(item).toMatchObject({ received: 1, attachmentId: null });
        expect((await deleteAttachment(getReq(), attParams(id))).status).toBe(404);
    });
});
