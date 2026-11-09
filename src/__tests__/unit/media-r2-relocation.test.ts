// @vitest-environment node
/**
 * Rangement par UL des objets R2 (`src/lib/media/r2-relocation.ts`, logique de
 * `scripts/move-r2-objects-to-ul-folders.ts`) : calcul des destinations, SQL de
 * lecture, copie → UPDATE gardé → suppression, idempotence, concurrence, code de
 * sortie. Base SQLite EN MÉMOIRE (`file::memory:`), bucket R2 factice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import {
    readRelocationRows,
    relocateRow,
    relocatedStagingKey,
    relocatedVehicleKey,
    relocationExitCode,
    relocationUlSegment,
    runR2Relocation,
    type RelocationDb,
    type RelocationStore,
} from '@/lib/media/r2-relocation';

const SID = '0f8fad5b-d9cb-469f-a165-70867728950e';

let client: Client;
let db: RelocationDb;

async function schema() {
    for (const sql of [
        `CREATE TABLE "UniteLocale" (id TEXT PRIMARY KEY, name TEXT, slug TEXT)`,
        `CREATE TABLE Vehicle (id TEXT PRIMARY KEY, name TEXT, ulId TEXT, photoR2Key TEXT, guideR2Key TEXT)`,
        `CREATE TABLE VehicleDocument (id TEXT PRIMARY KEY, vehicleId TEXT NOT NULL, r2Key TEXT NOT NULL UNIQUE, fileName TEXT, size INTEGER, createdAt TEXT)`,
        `CREATE TABLE "ExpenseReport" (id TEXT PRIMARY KEY, ulId TEXT, status TEXT, pendingReceiptKeys TEXT, userSignature TEXT)`,
        // Slug ≠ id : la clé doit porter le slug.
        `INSERT INTO "UniteLocale" VALUES ('ul-uuid-1', 'Paris 18', 'paris-18'), ('ul-uuid-2', 'Lyon 3', 'lyon-3')`,
    ]) await client.execute(sql);
}

function fakeStore(initial: Record<string, string> = {}) {
    const objects = new Map<string, Buffer>(Object.entries(initial).map(([k, v]) => [k, Buffer.from(v)]));
    const store: RelocationStore = {
        get: vi.fn(async (key: string) => objects.get(key) ?? null),
        put: vi.fn(async (key: string, body: Buffer) => { objects.set(key, body); }),
        head: vi.fn(async (key: string) => objects.has(key)),
        delete: vi.fn(async (key: string) => { objects.delete(key); }),
    };
    return { store, objects };
}

const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const one = async (sql: string) => (await client.execute(sql)).rows[0];

beforeEach(async () => {
    client = createClient({ url: 'file::memory:' });
    db = client as unknown as RelocationDb;
    await schema();
});

describe('destinations (fonctions pures)', () => {
    it('photo : vehicle-photos/{UL}/{nom}/{fichier}, même nom de fichier', () => {
        expect(relocatedVehicleKey('vehicle-photo', 'vehicle-photos/v1/ab12cd34.jpg', 'paris-18', 'VSAV 1'))
            .toBe('vehicle-photos/paris-18/vsav-1/ab12cd34.jpg');
    });

    it('document : vehicle-guides/ → vehicle-documents/', () => {
        expect(relocatedVehicleKey('vehicle-document', 'vehicle-guides/v1/att.pdf', 'paris-18', 'VSAV 1'))
            .toBe('vehicle-documents/paris-18/vsav-1/att.pdf');
    });

    it('déjà rangée : identique ; véhicule renommé ou slug changé : regroupée', () => {
        const key = 'vehicle-photos/paris-18/vsav-1/a.jpg';
        expect(relocatedVehicleKey('vehicle-photo', key, 'paris-18', 'VSAV 1')).toBe(key);
        expect(relocatedVehicleKey('vehicle-photo', key, 'paris-18', 'VSAV 2')).toBe('vehicle-photos/paris-18/vsav-2/a.jpg');
        expect(relocatedVehicleKey('vehicle-photo', key, 'paris-xviii', 'VSAV 1')).toBe('vehicle-photos/paris-xviii/vsav-1/a.jpg');
    });

    it('nom vide : repli sans-nom', () => {
        expect(relocatedVehicleKey('vehicle-photo', 'vehicle-photos/v1/a.jpg', 'paris-18', '')).toBe('vehicle-photos/paris-18/sans-nom/a.jpg');
    });

    it('clé étrangère au type : null (jamais touchée)', () => {
        expect(relocatedVehicleKey('vehicle-photo', 'vehicle-guides/v1/a.pdf', 'paris-18', 'x')).toBeNull();
        expect(relocatedVehicleKey('vehicle-photo', 'ndf/paris-18/x.pdf', 'paris-18', 'x')).toBeNull();
        expect(relocatedVehicleKey('vehicle-photo', 'vehicle-photos/../ndf/a.jpg', 'paris-18', 'x')).toBeNull();
        expect(relocatedVehicleKey('vehicle-document', 'vehicle-guides/a.pdf', 'paris-18', 'x')).toBeNull();
    });

    it('justificatif : ancienne forme rangée, nouvelle forme conservée ou regroupée, clé forgée refusée', () => {
        expect(relocatedStagingKey(`expenses-staging/${SID}/u-ticket.jpg`, 'paris-18')).toBe(`expenses-staging/paris-18/${SID}/u-ticket.jpg`);
        expect(relocatedStagingKey(`expenses-staging/paris-18/${SID}/u.jpg`, 'paris-18')).toBe(`expenses-staging/paris-18/${SID}/u.jpg`);
        expect(relocatedStagingKey(`expenses-staging/ancien-slug/${SID}/u.jpg`, 'paris-18')).toBe(`expenses-staging/paris-18/${SID}/u.jpg`);
        expect(relocatedStagingKey('ndf-revisions/paris-18/x.pdf', 'paris-18')).toBeNull();
    });

    it('segment UL : slug assaini, repli id ; null sans UL', () => {
        expect(relocationUlSegment('paris-18', 'ul-1')).toBe('paris-18');
        expect(relocationUlSegment('', 'ul-1')).toBe('ul-1');
        expect(relocationUlSegment(null, null)).toBeNull();
        expect(relocationUlSegment('x', 'default')).toBeNull();
    });

    it('code de sortie : 1 échec, 2 sautée, 0 sinon', () => {
        expect(relocationExitCode({ failed: 1, skipped: 3 })).toBe(1);
        expect(relocationExitCode({ failed: 0, skipped: 1 })).toBe(2);
        expect(relocationExitCode({ failed: 0, skipped: 0 })).toBe(0);
    });
});

describe('readRelocationRows', () => {
    it('lit photos, documents (avec guideR2Key) et brouillons seulement', async () => {
        await client.execute(`INSERT INTO Vehicle VALUES ('v1', 'VSAV 1', 'ul-uuid-1', 'vehicle-photos/v1/p.jpg', 'vehicle-guides/v1/g.pdf'), ('v2', 'VL', 'ul-uuid-2', NULL, NULL), ('v3', 'X', NULL, '', NULL)`);
        await client.execute(`INSERT INTO VehicleDocument VALUES ('d1', 'v1', 'vehicle-guides/v1/g.pdf', 'g.pdf', 1, 'x')`);
        await client.execute({
            sql: `INSERT INTO "ExpenseReport" VALUES ('e1', 'ul-uuid-1', 'brouillon', ?, NULL), ('e2', 'ul-uuid-1', 'soumis', ?, NULL), ('e3', 'ul-uuid-1', 'brouillon', NULL, NULL)`,
            args: [JSON.stringify([`expenses-staging/${SID}/a.jpg`]), JSON.stringify([`expenses-staging/${SID}/b.jpg`])],
        });
        const rows = await readRelocationRows(db);
        expect(rows.map((r) => [r.kind, r.rowId, r.ulSegment])).toEqual([
            ['vehicle-photo', 'v1', 'paris-18'],
            ['vehicle-document', 'd1', 'paris-18'],
            ['expense-staging', 'e1', 'paris-18'],
        ]);
        expect(rows[1].guideR2Key).toBe('vehicle-guides/v1/g.pdf');
    });
});

describe('runR2Relocation', () => {
    async function seedAll() {
        await client.execute(`INSERT INTO Vehicle VALUES ('v1', 'VSAV 1', 'ul-uuid-1', 'vehicle-photos/v1/p1.jpg', 'vehicle-guides/v1/g1.pdf')`);
        await client.execute(`INSERT INTO VehicleDocument VALUES ('d1', 'v1', 'vehicle-guides/v1/g1.pdf', 'g.pdf', 1, 'x'), ('d2', 'v1', 'vehicle-guides/v1/g2.pdf', 'h.pdf', 1, 'x')`);
        await client.execute({
            sql: `INSERT INTO "ExpenseReport" VALUES ('e1', 'ul-uuid-2', 'brouillon', ?, NULL)`,
            args: [JSON.stringify([`expenses-staging/${SID}/u-a.jpg`, `expenses-staging/${SID}/u-b.pdf`])],
        });
        return fakeStore({
            'vehicle-photos/v1/p1.jpg': 'photo',
            'vehicle-guides/v1/g1.pdf': 'guide',
            'vehicle-guides/v1/g2.pdf': 'doc2',
            [`expenses-staging/${SID}/u-a.jpg`]: 'a',
            [`expenses-staging/${SID}/u-b.pdf`]: '%PDF-b',
            'referentiels/x.pdf': 'ref',
            'ndf/paris-18/x/note-de-frais.pdf': 'ndf',
            'vehicle-photos/orphelin/z.jpg': 'orphelin',
        });
    }

    it('dry-run : n\'écrit rien et liste chaque clé et sa destination', async () => {
        const { store, objects } = await seedAll();
        const before = [...objects.keys()].sort();
        const info = vi.fn();
        const run = await runR2Relocation({ db, store, apply: false, deleteOld: false, log: { ...silent, info } });

        expect(run.stats).toMatchObject({ planned: 4, moved: 0, skipped: 0, failed: 0 });
        expect(run.exitCode).toBe(0);
        expect(store.put).not.toHaveBeenCalled();
        expect(store.delete).not.toHaveBeenCalled();
        expect([...objects.keys()].sort()).toEqual(before);
        expect((await one(`SELECT photoR2Key FROM Vehicle`)).photoR2Key).toBe('vehicle-photos/v1/p1.jpg');
        const out = info.mock.calls.map((c) => c[0]).join('\n');
        expect(out).toContain('vehicle-photos/v1/p1.jpg → vehicle-photos/paris-18/vsav-1/p1.jpg');
        expect(out).toContain('vehicle-guides/v1/g1.pdf → vehicle-documents/paris-18/vsav-1/g1.pdf');
        expect(out).toContain(`expenses-staging/${SID}/u-a.jpg → expenses-staging/lyon-3/${SID}/u-a.jpg`);
    });

    it('--apply --delete-old : copie, repointe (guide compris), supprime ; toute clé est rangée', async () => {
        const { store, objects } = await seedAll();
        const journal: unknown[] = [];
        const run = await runR2Relocation({ db, store, apply: true, deleteOld: true, log: silent, onJournal: (e) => journal.push(e) });

        expect(run.stats).toMatchObject({ moved: 4, skipped: 0, failed: 0, deleted: 5 });
        expect(run.exitCode).toBe(0);
        expect(journal).toHaveLength(4);

        expect(await one(`SELECT photoR2Key, guideR2Key FROM Vehicle WHERE id = 'v1'`)).toMatchObject({
            photoR2Key: 'vehicle-photos/paris-18/vsav-1/p1.jpg',
            guideR2Key: 'vehicle-documents/paris-18/vsav-1/g1.pdf',
        });
        const docs = (await client.execute(`SELECT r2Key FROM VehicleDocument ORDER BY id`)).rows.map((r) => r.r2Key);
        expect(docs).toEqual(['vehicle-documents/paris-18/vsav-1/g1.pdf', 'vehicle-documents/paris-18/vsav-1/g2.pdf']);
        expect(JSON.parse(String((await one(`SELECT pendingReceiptKeys FROM "ExpenseReport"`)).pendingReceiptKeys))).toEqual([
            `expenses-staging/lyon-3/${SID}/u-a.jpg`, `expenses-staging/lyon-3/${SID}/u-b.pdf`,
        ]);
        expect(objects.get('vehicle-documents/paris-18/vsav-1/g1.pdf')?.toString()).toBe('guide');
        expect(store.put).toHaveBeenCalledWith(`expenses-staging/lyon-3/${SID}/u-b.pdf`, expect.any(Buffer), 'application/pdf');

        // Hors referentiels/, demo/ et orphelins non référencés : tout est sous {type}/{slug}/.
        const keys = [...objects.keys()].filter((k) => !k.startsWith('referentiels/') && !k.includes('orphelin'));
        for (const k of keys) expect(k, k).toMatch(/^(vehicle-photos|vehicle-documents|expenses-staging|ndf)\/(paris-18|lyon-3)\//);
        // Orphelin non référencé : jamais touché.
        expect(objects.has('vehicle-photos/orphelin/z.jpg')).toBe(true);
    });

    it('idempotent : un second passage ne recopie rien', async () => {
        const { store } = await seedAll();
        await runR2Relocation({ db, store, apply: true, deleteOld: true, log: silent });
        vi.mocked(store.put).mockClear();
        const run = await runR2Relocation({ db, store, apply: true, deleteOld: true, log: silent });
        expect(run.stats).toMatchObject({ moved: 0, unchanged: 4 });
        expect(store.put).not.toHaveBeenCalled();
    });

    it('sans --delete-old : les anciennes clés restent', async () => {
        const { store, objects } = await seedAll();
        await runR2Relocation({ db, store, apply: true, deleteOld: false, log: silent });
        expect(store.delete).not.toHaveBeenCalled();
        expect(objects.has('vehicle-photos/v1/p1.jpg')).toBe(true);
    });

    it('véhicule renommé : regroupé sous le nouveau nom au passage suivant', async () => {
        const { store, objects } = await seedAll();
        await runR2Relocation({ db, store, apply: true, deleteOld: true, log: silent });
        await client.execute(`UPDATE Vehicle SET name = 'VSAV 2' WHERE id = 'v1'`);
        const run = await runR2Relocation({ db, store, apply: true, deleteOld: true, log: silent });
        expect(run.stats.moved).toBe(3);
        expect((await one(`SELECT photoR2Key FROM Vehicle`)).photoR2Key).toBe('vehicle-photos/paris-18/vsav-2/p1.jpg');
        expect(objects.get('vehicle-photos/paris-18/vsav-2/p1.jpg')?.toString()).toBe('photo');
        expect(objects.has('vehicle-photos/paris-18/vsav-1/p1.jpg')).toBe(false);
    });

    it('source absente : ligne sautée, listée, base intacte, code 2', async () => {
        const { store, objects } = await seedAll();
        objects.delete(`expenses-staging/${SID}/u-b.pdf`);
        const warn = vi.fn();
        const run = await runR2Relocation({ db, store, apply: true, deleteOld: true, log: { ...silent, warn } });
        expect(run.stats).toMatchObject({ moved: 3, skipped: 1, failed: 0 });
        expect(run.exitCode).toBe(2);
        expect(run.skipped[0]).toContain(`expenses-staging/${SID}/u-b.pdf`);
        expect(JSON.parse(String((await one(`SELECT pendingReceiptKeys FROM "ExpenseReport"`)).pendingReceiptKeys))[0])
            .toBe(`expenses-staging/${SID}/u-a.jpg`);
        // Aucune copie partielle, original intact.
        expect(objects.has(`expenses-staging/lyon-3/${SID}/u-a.jpg`)).toBe(false);
        expect(objects.has(`expenses-staging/${SID}/u-a.jpg`)).toBe(true);
    });

    it('véhicule sans UL : sauté', async () => {
        await client.execute(`INSERT INTO Vehicle VALUES ('v9', 'Sans UL', NULL, 'vehicle-photos/v9/a.jpg', NULL)`);
        const { store } = fakeStore({ 'vehicle-photos/v9/a.jpg': 'x' });
        const run = await runR2Relocation({ db, store, apply: true, deleteOld: false, log: silent });
        expect(run.stats.skipped).toBe(1);
        expect(store.put).not.toHaveBeenCalled();
    });

    it('brouillon portant une clé hors dépôt : sauté, jamais déplacée', async () => {
        await client.execute({
            sql: `INSERT INTO "ExpenseReport" VALUES ('e9', 'ul-uuid-1', 'brouillon', ?, NULL)`,
            args: [JSON.stringify([`expenses-staging/${SID}/a.jpg`, 'ndf-revisions/paris-18/x.pdf'])],
        });
        const { store } = fakeStore({ [`expenses-staging/${SID}/a.jpg`]: 'a', 'ndf-revisions/paris-18/x.pdf': 'n' });
        const run = await runR2Relocation({ db, store, apply: true, deleteOld: true, log: silent });
        expect(run.stats.skipped).toBe(1);
        expect(store.put).not.toHaveBeenCalled();
        expect(store.delete).not.toHaveBeenCalled();
    });

    it('guide sans document correspondant : signalé (sauté)', async () => {
        await client.execute(`INSERT INTO Vehicle VALUES ('v1', 'VSAV 1', 'ul-uuid-1', NULL, 'vehicle-guides/v1/seul.pdf')`);
        const { store } = fakeStore({ 'vehicle-guides/v1/seul.pdf': 'g' });
        const run = await runR2Relocation({ db, store, apply: true, deleteOld: false, log: silent });
        expect(run.exitCode).toBe(2);
        expect(run.skipped[0]).toContain('vehicle-guides/v1/seul.pdf');
    });

    it('échec R2 : compté en échec, code 1', async () => {
        const { store } = await seedAll();
        vi.mocked(store.put).mockRejectedValueOnce(new Error('HTTP 500'));
        const run = await runR2Relocation({ db, store, apply: true, deleteOld: false, log: silent });
        expect(run.stats.failed).toBe(1);
        expect(run.exitCode).toBe(1);
    });
});

describe('relocateRow — concurrence', () => {
    it('clé changée avant l\'UPDATE : sautée (0 ligne), copie supprimée', async () => {
        await client.execute(`INSERT INTO Vehicle VALUES ('v1', 'VSAV 1', 'ul-uuid-1', 'vehicle-photos/v1/p1.jpg', NULL)`);
        const { store, objects } = fakeStore({ 'vehicle-photos/v1/p1.jpg': 'photo' });
        const [row] = await readRelocationRows(db);
        // Un remplacement de photo passe entre la lecture et l'UPDATE.
        vi.mocked(store.put).mockImplementationOnce(async (key: string, body: Buffer) => {
            objects.set(key, body);
            await client.execute(`UPDATE Vehicle SET photoR2Key = 'vehicle-photos/paris-18/vsav-1/neuve.jpg'`);
        });
        const result = await relocateRow(row, { db, store }, { apply: true, deleteOld: true });
        expect(result.status).toBe('skipped');
        expect(objects.has('vehicle-photos/paris-18/vsav-1/p1.jpg')).toBe(false);
        expect(objects.has('vehicle-photos/v1/p1.jpg')).toBe(true);
        expect((await one(`SELECT photoR2Key FROM Vehicle`)).photoR2Key).toBe('vehicle-photos/paris-18/vsav-1/neuve.jpg');
    });

    it('document changé avant l\'UPDATE : le guide n\'est pas repointé seul', async () => {
        await client.execute(`INSERT INTO Vehicle VALUES ('v1', 'VSAV 1', 'ul-uuid-1', NULL, 'vehicle-guides/v1/g1.pdf')`);
        await client.execute(`INSERT INTO VehicleDocument VALUES ('d1', 'v1', 'vehicle-guides/v1/g1.pdf', 'g.pdf', 1, 'x')`);
        const { store } = fakeStore({ 'vehicle-guides/v1/g1.pdf': 'g' });
        const [row] = await readRelocationRows(db);
        vi.mocked(store.put).mockImplementationOnce(async () => {
            await client.execute(`UPDATE VehicleDocument SET r2Key = 'autre.pdf'`);
        });
        const result = await relocateRow(row, { db, store }, { apply: true, deleteOld: false });
        expect(result.status).toBe('skipped');
        expect((await one(`SELECT guideR2Key FROM Vehicle`)).guideR2Key).toBe('vehicle-guides/v1/g1.pdf');
    });
});

describe('revue 1 — type, segments, références', () => {
    it('PDF sans extension : typé par sa signature %PDF, pas par la clé', async () => {
        await client.execute(`INSERT INTO Vehicle VALUES ('v1', 'VSAV 1', 'ul-uuid-1', 'vehicle-photos/v1/p1.jpg', NULL)`);
        await client.execute(`INSERT INTO VehicleDocument VALUES ('d1', 'v1', 'vehicle-guides/v1/sansext', 'g', 1, 'x')`);
        const { store } = fakeStore({ 'vehicle-guides/v1/sansext': '%PDF-1.7 guide', 'vehicle-photos/v1/p1.jpg': 'jpeg' });
        await runR2Relocation({ db, store, apply: true, deleteOld: false, log: silent });
        expect(store.put).toHaveBeenCalledWith('vehicle-documents/paris-18/vsav-1/sansext', expect.any(Buffer), 'application/pdf');
        expect(store.put).toHaveBeenCalledWith('vehicle-photos/paris-18/vsav-1/p1.jpg', expect.any(Buffer), 'image/jpeg');
    });

    it('nom de fichier contenant .. : rangé ; segment .. : jamais', () => {
        expect(relocatedVehicleKey('vehicle-photo', 'vehicle-photos/v1/a..b.jpg', 'paris-18', 'VSAV 1')).toBe('vehicle-photos/paris-18/vsav-1/a..b.jpg');
        expect(relocatedVehicleKey('vehicle-photo', 'vehicle-photos/../a.jpg', 'paris-18', 'VSAV 1')).toBeNull();
        expect(relocatedStagingKey(`expenses-staging/${SID}/facture..pdf`, 'paris-18')).toBe(`expenses-staging/paris-18/${SID}/facture..pdf`);
    });

    it('ancien stagingId non-UUID : rangé', () => {
        expect(relocatedStagingKey('expenses-staging/s1/a.jpg', 'paris-18')).toBe('expenses-staging/paris-18/s1/a.jpg');
    });

    it("--delete-old : une ancienne clé encore portée par un autre brouillon (JSON à barres échappées) n'est pas supprimée", async () => {
        const key = `expenses-staging/${SID}/u-a.jpg`;
        await client.execute({ sql: `INSERT INTO "ExpenseReport" VALUES ('e1', 'ul-uuid-1', 'brouillon', ?, NULL)`, args: [JSON.stringify([key])] });
        // Même clé, écrite `\/` : `json_each` la reconnaît, une recherche de sous-chaîne non.
        await client.execute({ sql: `INSERT INTO "ExpenseReport" VALUES ('e2', 'ul-uuid-1', 'soumis', ?, NULL)`, args: [`["${key.replace(/\//g, '\\/')}"]`] });
        const { store, objects } = fakeStore({ [key]: 'a' });
        const run = await runR2Relocation({ db, store, apply: true, deleteOld: true, log: silent });
        expect(run.stats.moved).toBe(1);
        expect(objects.has(key)).toBe(true);
        expect(store.delete).not.toHaveBeenCalledWith(key);
    });

    it('JSON de justificatifs invalide ailleurs : ignoré par la vérification de références', async () => {
        const key = `expenses-staging/${SID}/u-a.jpg`;
        await client.execute({ sql: `INSERT INTO "ExpenseReport" VALUES ('e1', 'ul-uuid-1', 'brouillon', ?, NULL)`, args: [JSON.stringify([key])] });
        await client.execute(`INSERT INTO "ExpenseReport" VALUES ('e2', 'ul-uuid-1', 'soumis', 'pas du json', NULL)`);
        const { store, objects } = fakeStore({ [key]: 'a' });
        const run = await runR2Relocation({ db, store, apply: true, deleteOld: true, log: silent });
        expect(run.stats).toMatchObject({ moved: 1, failed: 0 });
        expect(objects.has(key)).toBe(false);
    });
});
