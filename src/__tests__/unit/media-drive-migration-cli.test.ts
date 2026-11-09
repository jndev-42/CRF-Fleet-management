// @vitest-environment node
/**
 * Câblage CLI de `scripts/migrate-drive-images-to-r2.ts` (`src/lib/media/drive-migration-cli.ts`) :
 * SQL de lecture des lignes, repli d'UL des missions, adaptateur Drive, déroulé,
 * code de sortie. Base SQLite EN MÉMOIRE (`file::memory:`), Drive et R2 factices.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import {
    exitCodeOf,
    migrationUlSegment,
    readMigrationRows,
    runDriveMigration,
    type MigrationDb,
} from '@/lib/media/drive-migration-cli';
import { DRIVE_FOLDER_MIME, stableHex, type DriveItem, type DriveSource, type MediaSink } from '@/lib/media/drive-migration';
import { createDriveSource, type DriveClient } from '@/lib/media/drive-source';

let client: Client;
let db: MigrationDb;

async function schema() {
    for (const sql of [
        `CREATE TABLE "UniteLocale" (id TEXT PRIMARY KEY, name TEXT, slug TEXT)`,
        `CREATE TABLE Vehicle (id TEXT PRIMARY KEY, name TEXT, ulId TEXT)`,
        `CREATE TABLE Trip (id TEXT PRIMARY KEY, vehicleId TEXT, driveFolderId TEXT)`,
        `CREATE TABLE "IncidentReport" (id TEXT PRIMARY KEY, vehicleId TEXT, driveFolderId TEXT)`,
        `CREATE TABLE "mission_reports" (id TEXT PRIMARY KEY, mission_name TEXT, ulId TEXT, submitted_by TEXT, drive_folder_id TEXT, signed_report_drive_id TEXT)`,
        `CREATE TABLE "UserUL" (userId TEXT, ulId TEXT, is_home INTEGER)`,
        // Slug ≠ id : la clé doit porter le slug.
        `INSERT INTO "UniteLocale" VALUES ('ul-uuid-1', 'Paris 18', 'paris-18'), ('ul-uuid-2', 'Lyon 3', 'lyon-3')`,
        `INSERT INTO Vehicle VALUES ('v1', 'VSAV 1', 'ul-uuid-1'), ('v2', 'Sans UL', NULL)`,
        `INSERT INTO "UserUL" VALUES ('author', 'ul-uuid-1', 0), ('author', 'ul-uuid-2', 1)`,
    ]) await client.execute(sql);
}

/** Drive factice : dossiers et fichiers indexés par id. */
function fakeDrive(items: Record<string, DriveItem & { parent?: string }>, unreadable: string[] = []) {
    const trashed: string[] = [];
    const drive: DriveSource = {
        get: vi.fn(async (id: string) => items[id] ?? null),
        list: vi.fn(async (folderId: string) => Object.values(items).filter((i) => i.parent === folderId)),
        download: vi.fn(async (id: string) => {
            if (unreadable.includes(id)) throw new Error('403');
            return Buffer.from(id);
        }),
        trash: vi.fn(async (id: string) => { trashed.push(id); }),
    };
    return { drive, trashed };
}

function fakeR2() {
    const store = new Map<string, Buffer>();
    const r2: MediaSink = {
        put: vi.fn(async (key: string, body: Buffer) => { store.set(key, body); }),
        delete: vi.fn(async (key: string) => { store.delete(key); }),
    };
    return { r2, store };
}

const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const CREATED = '2026-11-08T13:30:00.000Z';
const folder = (id: string, name = id): DriveItem => ({ id, name, mimeType: DRIVE_FOLDER_MIME, createdTime: CREATED });

beforeEach(async () => {
    client = createClient({ url: 'file::memory:' });
    db = client as unknown as MigrationDb;
    await schema();
});

describe('readMigrationRows (SQL, alias, repli d\'UL)', () => {
    it('UL du véhicule : segment = slug, pas l\'id ; références R2 et vides non sélectionnées', async () => {
        await client.execute(`INSERT INTO Trip VALUES ('t1', 'v1', 'drv-t1'), ('t2', 'v1', 'trip-photos/paris-18/x'), ('t3', 'v1', NULL), ('t4', 'v1', '')`);
        await client.execute(`INSERT INTO "IncidentReport" VALUES ('i1', 'v1', 'drv-i1')`);
        const rows = await readMigrationRows(db);
        expect(rows).toEqual([
            { kind: 'trip', rowId: 't1', driveId: 'drv-t1', ulSegment: 'paris-18', name: 'VSAV 1' },
            { kind: 'incident', rowId: 'i1', driveId: 'drv-i1', ulSegment: 'paris-18', name: 'VSAV 1' },
        ]);
    });

    it('mission DT (ulId NULL, vide ou « default ») → UL de rattachement de l\'auteur (is_home d\'abord)', async () => {
        await client.execute(`INSERT INTO "mission_reports" VALUES
            ('m-ul', 'Maraude', 'ul-uuid-1', 'author', 'drv-a', NULL),
            ('m-null', 'DPS DT', NULL, 'author', 'drv-b', 'drv-sr'),
            ('m-default', 'DPS', 'default', 'author', 'drv-c', NULL),
            ('m-vide', 'DPS', '', 'inconnu', 'drv-d', NULL)`);
        const rows = await readMigrationRows(db);
        const seg = (kind: string, id: string) => rows.find((r) => r.kind === kind && r.rowId === id)?.ulSegment;
        expect(seg('mission-com', 'm-ul')).toBe('paris-18');
        expect(seg('mission-com', 'm-null')).toBe('lyon-3');
        expect(seg('mission-report', 'm-null')).toBe('lyon-3');
        expect(seg('mission-com', 'm-default')).toBe('lyon-3');
        expect(seg('mission-com', 'm-vide')).toBeNull();
    });

    it('véhicule sans UL → segment null (sauté plus tard)', async () => {
        await client.execute(`INSERT INTO Trip VALUES ('t1', 'v2', 'drv-t1')`);
        expect((await readMigrationRows(db))[0].ulSegment).toBeNull();
    });

    it('migrationUlSegment : slug assaini, repli sur l\'id, null sans UL', () => {
        expect(migrationUlSegment('paris-18', 'ul-1')).toBe('paris-18');
        expect(migrationUlSegment(null, 'ul-1')).toBe('ul-1');
        expect(migrationUlSegment('-x', 'ul-1')).toBe('x');
        expect(migrationUlSegment('x', null)).toBeNull();
        expect(migrationUlSegment('x', 'default')).toBeNull();
    });
});

describe('runDriveMigration (déroulé, code de sortie)', () => {
    async function seedTrips() {
        await client.execute(`INSERT INTO Trip VALUES ('t1', 'v1', 'drv-ok'), ('t2', 'v1', 'drv-ko')`);
    }
    const items = {
        'drv-ok': folder('drv-ok'),
        'drv-ok-emp': { ...folder('drv-ok-emp', 'emprunt'), parent: 'drv-ok' },
        'p1': { id: 'p1', name: 'a.jpg', mimeType: 'image/jpeg', parent: 'drv-ok-emp' },
        'drv-ko': folder('drv-ko'),
        'drv-ko-emp': { ...folder('drv-ko-emp', 'emprunt'), parent: 'drv-ko' },
        'p2': { id: 'p2', name: 'b.jpg', mimeType: 'image/jpeg', parent: 'drv-ko-emp' },
    };

    it('dry-run : rien n\'est écrit (ni base, ni R2, ni Drive), plan journalisé', async () => {
        await seedTrips();
        const { drive } = fakeDrive(items);
        const { r2, store } = fakeR2();
        const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        const run = await runDriveMigration({ db, drive, r2, apply: false, deleteOld: false, log });
        expect(run.stats.planned).toBe(2);
        expect(run.exitCode).toBe(0);
        expect(store.size).toBe(0);
        expect(drive.download).not.toHaveBeenCalled();
        expect(drive.trash).not.toHaveBeenCalled();
        const trips = (await client.execute(`SELECT id, driveFolderId FROM Trip ORDER BY id`)).rows.map((r) => r.driveFolderId);
        expect(trips).toEqual(['drv-ok', 'drv-ko']);
        expect(log.info.mock.calls.flat().join('\n')).toContain(`trip-photos/paris-18/vsav-1-20261108-143000-${stableHex('drv-ok', 4)}`);
    });

    it('apply avec un échec : code de sortie 1, la ligne en échec garde son id Drive, l\'autre est repointée', async () => {
        await seedTrips();
        const { drive, trashed } = fakeDrive(items, ['p2']);
        const { r2, store } = fakeR2();
        const run = await runDriveMigration({ db, drive, r2, apply: true, deleteOld: true, log: silent });
        expect(run.exitCode).toBe(1);
        expect(run.stats).toMatchObject({ migrated: 1, failed: 1, trashed: 1 });
        expect(run.failures[0]).toMatch(/drv-ko.*illisible/);
        const trips = Object.fromEntries((await client.execute(`SELECT id, driveFolderId FROM Trip`)).rows.map((r) => [r.id, r.driveFolderId]));
        expect(trips.t1).toBe(`trip-photos/paris-18/vsav-1-20261108-143000-${stableHex('drv-ok', 4)}`);
        expect(trips.t2).toBe('drv-ko');
        expect(trashed).toEqual(['drv-ok']);
        expect([...store.keys()].every((k) => k.startsWith(trips.t1 as string))).toBe(true);
        expect(run.journal).toEqual([{ table: 'Trip', rowId: 't1', oldId: 'drv-ok', newRef: trips.t1, trashed: true }]);
    });

    it('apply sans échec : code de sortie 0 ; rien à migrer : 0', async () => {
        await client.execute(`INSERT INTO Trip VALUES ('t1', 'v1', 'drv-ok')`);
        const { drive } = fakeDrive(items);
        expect((await runDriveMigration({ db, drive, r2: fakeR2().r2, apply: true, deleteOld: false, log: silent })).exitCode).toBe(0);
        const empty = await runDriveMigration({ db, drive, r2: fakeR2().r2, apply: true, deleteOld: false, log: silent });
        expect(empty).toMatchObject({ groupCount: 0, exitCode: 0 });
    });

    it('mission DT migrée sous l\'UL de rattachement de l\'auteur', async () => {
        await client.execute(`INSERT INTO "mission_reports" VALUES ('m1', 'DPS DT', NULL, 'author', 'drv-m', NULL)`);
        const { drive } = fakeDrive({ 'drv-m': folder('drv-m'), x: { id: 'x', name: 'x.jpg', mimeType: 'image/jpeg', parent: 'drv-m' } });
        await runDriveMigration({ db, drive, r2: fakeR2().r2, apply: true, deleteOld: false, log: silent });
        const ref = (await client.execute(`SELECT drive_folder_id FROM "mission_reports" WHERE id = 'm1'`)).rows[0].drive_folder_id;
        expect(ref).toBe(`mission-com-photos/lyon-3/dps-dt-20261108-143000-${stableHex('drv-m', 4)}`);
    });

    it('ligne sans UL : sautée, pas un échec, mais code de sortie 2 (id Drive restant)', async () => {
        await client.execute(`INSERT INTO Trip VALUES ('t1', 'v2', 'drv-ok')`);
        const { drive } = fakeDrive(items);
        const run = await runDriveMigration({ db, drive, r2: fakeR2().r2, apply: true, deleteOld: false, log: silent });
        expect(run.stats).toMatchObject({ skipped: 1, failed: 0 });
        expect(run.exitCode).toBe(2);
    });

    it('un échec l\'emporte sur une ligne sautée : code de sortie 1', async () => {
        await client.execute(`INSERT INTO Trip VALUES ('t1', 'v2', 'drv-ok'), ('t2', 'v1', 'drv-ko')`);
        const { drive } = fakeDrive(items, ['p2']);
        const run = await runDriveMigration({ db, drive, r2: fakeR2().r2, apply: true, deleteOld: false, log: silent });
        expect(run.stats).toMatchObject({ skipped: 1, failed: 1 });
        expect(run.exitCode).toBe(1);
    });

    it('onJournal est appelé pour chaque ligne repointée, au fil de l\'exécution', async () => {
        await seedTrips();
        const { drive } = fakeDrive(items, ['p2']);
        const seen: string[] = [];
        const r2 = fakeR2().r2;
        const run = await runDriveMigration({
            db, drive, r2, apply: true, deleteOld: false, log: silent,
            onJournal: (entry) => { seen.push(`${entry.table}:${entry.rowId}`); },
        });
        expect(seen).toEqual(['Trip:t1']);
        expect(run.journal.map((e) => e.rowId)).toEqual(['t1']);
    });

    it('exitCodeOf', () => {
        expect(exitCodeOf({ failed: 0, skipped: 0 })).toBe(0);
        expect(exitCodeOf({ failed: 2, skipped: 0 })).toBe(1);
        expect(exitCodeOf({ failed: 0, skipped: 3 })).toBe(2);
        expect(exitCodeOf({ failed: 1, skipped: 3 })).toBe(1);
    });
});

describe('createDriveSource (adaptateur Drive injecté)', () => {
    function fakeClient(pages: Record<string, { files: { id: string; name: string; mimeType: string }[]; nextPageToken?: string }>) {
        return {
            files: {
                get: vi.fn(async (params: { fileId: string; alt?: string }) => {
                    if (params.fileId === 'absent') throw Object.assign(new Error('not found'), { code: 404 });
                    if (params.fileId === 'corbeille') return { data: { id: 'corbeille', trashed: true } };
                    if (params.alt === 'media') return { data: new TextEncoder().encode('octets').buffer };
                    return { data: { id: params.fileId, name: 'Dossier', mimeType: DRIVE_FOLDER_MIME, createdTime: CREATED } };
                }),
                list: vi.fn(async (params: { q: string; pageToken?: string }) => ({ data: pages[params.pageToken ?? 'first'] })),
                update: vi.fn(async () => ({ data: {} })),
            },
        } as unknown as DriveClient;
    }

    it('get : métadonnées ; 404 ou dossier à la corbeille → null', async () => {
        const source = createDriveSource(fakeClient({}));
        expect(await source.get('d1')).toEqual({ id: 'd1', name: 'Dossier', mimeType: DRIVE_FOLDER_MIME, createdTime: CREATED });
        expect(await source.get('absent')).toBeNull();
        expect(await source.get('corbeille')).toBeNull();
    });

    it('list : toutes les pages, requête limitée aux enfants non supprimés', async () => {
        const c = fakeClient({
            first: { files: [{ id: 'a', name: 'a.jpg', mimeType: 'image/jpeg' }], nextPageToken: 'p2' },
            p2: { files: [{ id: 'b', name: 'b.jpg', mimeType: 'image/jpeg' }] },
        });
        const items = await createDriveSource(c).list("dossier'1");
        expect(items.map((i) => i.id)).toEqual(['a', 'b']);
        expect(vi.mocked(c.files.list).mock.calls[0][0]).toMatchObject({ q: "'dossier\\'1' in parents and trashed=false" });
    });

    it('download et trash', async () => {
        const c = fakeClient({});
        const source = createDriveSource(c);
        expect((await source.download('f')).toString()).toBe('octets');
        await source.trash('d1');
        expect(vi.mocked(c.files.update)).toHaveBeenCalledWith({ fileId: 'd1', requestBody: { trashed: true } });
    });
});
