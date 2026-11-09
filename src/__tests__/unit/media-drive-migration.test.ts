// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
    DRIVE_FOLDER_MIME,
    collectDriveSources,
    copyDriveSources,
    fileNameWithExtension,
    groupMigrationRows,
    journalEntries,
    migrateGroup,
    planDriveFiles,
    stableHex,
    type DriveItem,
    type DriveMigrationDeps,
    type MigrationGroup,
    type MigrationRow,
} from '@/lib/media/drive-migration';

// Dossier Drive créé le 08/11/2026 14:30:00 à Paris.
const CREATED = '2026-11-08T13:30:00.000Z';
const FOLDER = DRIVE_FOLDER_MIME;

interface FakeDrive {
    items: Record<string, DriveItem & { parent?: string }>;
    content?: Record<string, string>;
    unreadable?: string[];
}

function makeDeps(fake: FakeDrive, rowsAffected: number | ((sql: string) => number) = 1) {
    const r2 = new Map<string, Buffer>();
    const trashed: string[] = [];
    const deps: DriveMigrationDeps = {
        drive: {
            get: vi.fn(async (id: string) => fake.items[id] ?? null),
            list: vi.fn(async (folderId: string) => Object.values(fake.items).filter((i) => i.parent === folderId)),
            download: vi.fn(async (id: string) => {
                if (fake.unreadable?.includes(id)) throw new Error('403 Forbidden');
                return Buffer.from(fake.content?.[id] ?? id);
            }),
            trash: vi.fn(async (id: string) => { trashed.push(id); }),
        },
        r2: {
            put: vi.fn(async (key: string, body: Buffer) => { r2.set(key, body); }),
            delete: vi.fn(async (key: string) => { r2.delete(key); }),
        },
        execute: vi.fn(async (stmt: { sql: string }) => ({ rowsAffected: typeof rowsAffected === 'function' ? rowsAffected(stmt.sql) : rowsAffected })),
    };
    return { deps, r2, trashed };
}

const tripFolder: FakeDrive = {
    items: {
        'drv-trip': { id: 'drv-trip', name: 'VSAV 1-2026-11-08_14-30', mimeType: FOLDER, createdTime: CREATED },
        'drv-emp': { id: 'drv-emp', name: 'emprunt', mimeType: FOLDER, parent: 'drv-trip' },
        'drv-ren': { id: 'drv-ren', name: 'rendu', mimeType: FOLDER, parent: 'drv-trip' },
        'f1': { id: 'f1', name: 'IMG_1.jpg', mimeType: 'image/jpeg', parent: 'drv-emp' },
        'f2': { id: 'f2', name: 'IMG_2', mimeType: 'image/png', parent: 'drv-ren' },
    },
};

function group(rows: Omit<MigrationRow, 'driveId'>[], driveId: string): MigrationGroup {
    return groupMigrationRows(rows.map((r) => ({ ...r, driveId })))[0];
}

const tripGroup = group([{ kind: 'trip', rowId: 'trip-1', ulSegment: 'paris-18', name: 'VSAV 1' }], 'drv-trip');
const PREFIX = `trip-photos/paris-18/vsav-1-20261108-143000-${stableHex('drv-trip', 4)}`;

describe('groupMigrationRows', () => {
    it('un id Drive = un seul groupe, tous types et lignes confondus', () => {
        const groups = groupMigrationRows([
            { kind: 'mission-com', rowId: 'm1', driveId: 'drv-x', ulSegment: 'paris-18', name: 'Maraude' },
            { kind: 'mission-com', rowId: 'm2', driveId: 'drv-x', ulSegment: 'paris-18', name: 'Maraude' },
            { kind: 'trip', rowId: 't1', driveId: 'drv-x', ulSegment: 'paris-18', name: 'VSAV' },
            { kind: 'trip', rowId: 't2', driveId: 'trip-photos/paris-18/deja', ulSegment: 'paris-18', name: 'VSAV' },
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].targets).toEqual([
            { kind: 'mission-com', rowIds: ['m1', 'm2'], name: 'Maraude' },
            { kind: 'trip', rowIds: ['t1'], name: 'VSAV' },
        ]);
        expect(groups[0].ulSegment).toBe('paris-18');
    });

    it('signale les lignes sans UL et les UL différentes', () => {
        const [noUl] = groupMigrationRows([{ kind: 'trip', rowId: 't', driveId: 'd', ulSegment: null, name: 'x' }]);
        expect(noUl.ulSegment).toBeNull();
        const [multi] = groupMigrationRows([
            { kind: 'mission-com', rowId: 'm1', driveId: 'd', ulSegment: 'paris-18', name: 'x' },
            { kind: 'mission-com', rowId: 'm2', driveId: 'd', ulSegment: 'lyon-3', name: 'x' },
        ]);
        expect(multi.ulConflict).toEqual(['lyon-3', 'paris-18']);
    });
});

describe('fileNameWithExtension', () => {
    it('ajoute l\'extension déduite du type MIME si absente', () => {
        expect(fileNameWithExtension({ id: 'x', name: 'IMG_2', mimeType: 'image/png' })).toBe('IMG_2.png');
        expect(fileNameWithExtension({ id: 'x', name: 'a.jpg', mimeType: 'image/png' })).toBe('a.jpg');
    });
});

describe('migrateGroup — trajet', () => {
    it('dry-run : plan complet et déterministe, aucune écriture', async () => {
        const { deps } = makeDeps(tripFolder);
        const res = await migrateGroup(tripGroup, deps, { apply: false, deleteOld: false });
        expect(res.status).toBe('planned');
        expect(res.targets[0].newRef).toBe(PREFIX);
        expect(res.targets[0].files.map((f) => f.key)).toEqual([
            `${PREFIX}/emprunt/${stableHex('f1', 8)}-img-1.jpg`,
            `${PREFIX}/rendu/${stableHex('f2', 8)}-img-2.png`,
        ]);
        expect(deps.r2.put).not.toHaveBeenCalled();
        expect(deps.execute).not.toHaveBeenCalled();
        expect(deps.drive.download).not.toHaveBeenCalled();
        expect(deps.drive.trash).not.toHaveBeenCalled();
    });

    it('apply écrit exactement les clés annoncées par le dry-run', async () => {
        const plan = await migrateGroup(tripGroup, makeDeps(tripFolder).deps, { apply: false, deleteOld: false });
        const { deps, r2 } = makeDeps(tripFolder);
        const res = await migrateGroup(tripGroup, deps, { apply: true, deleteOld: false });
        expect([...r2.keys()]).toEqual(plan.targets[0].files.map((f) => f.key));
        expect(res.targets[0].newRef).toBe(plan.targets[0].newRef);
    });

    it('apply : colonne repointée (UPDATE gardé), Drive intact sans --delete-old, journal', async () => {
        const { deps, r2, trashed } = makeDeps(tripFolder);
        const res = await migrateGroup(tripGroup, deps, { apply: true, deleteOld: false });
        expect(res.status).toBe('migrated');
        expect(r2.get(res.targets[0].files[0].key)?.toString()).toBe('f1');
        const call = vi.mocked(deps.execute).mock.calls[0][0];
        expect(call.sql).toBe('UPDATE "Trip" SET driveFolderId = ? WHERE driveFolderId = ?');
        expect(call.args).toEqual([PREFIX, 'drv-trip']);
        expect(trashed).toEqual([]);
        expect(journalEntries(res)).toEqual([{ table: 'Trip', rowId: 'trip-1', oldId: 'drv-trip', newRef: PREFIX, trashed: false }]);
    });

    it('--delete-old : original mis à la corbeille APRÈS l\'UPDATE', async () => {
        const { deps, trashed } = makeDeps(tripFolder);
        const res = await migrateGroup(tripGroup, deps, { apply: true, deleteOld: true });
        expect(res.trashed).toBe(true);
        expect(trashed).toEqual(['drv-trip']);
        expect(vi.mocked(deps.execute).mock.invocationCallOrder[0])
            .toBeLessThan(vi.mocked(deps.drive.trash).mock.invocationCallOrder[0]);
        expect(journalEntries(res)[0].trashed).toBe(true);
    });

    it('corbeille partielle : un fichier non repris → colonne repointée, dossier Drive conservé et signalé', async () => {
        const items = { ...tripFolder.items, extra: { id: 'extra', name: 'notes.txt', mimeType: 'text/plain', parent: 'drv-trip' } };
        const { deps, trashed } = makeDeps({ items });
        const res = await migrateGroup(tripGroup, deps, { apply: true, deleteOld: true });
        expect(res.status).toBe('migrated');
        expect(res.targets[0].updated).toBe(true);
        expect(res.ignoredFiles).toEqual(['notes.txt']);
        expect(res.trashed).toBe(false);
        expect(res.reason).toMatch(/conservé/);
        expect(trashed).toEqual([]);
    });

    it('fichier illisible : référence sautée et listée, aucun UPDATE, Drive intact, objets R2 retirés', async () => {
        const { deps, r2, trashed } = makeDeps({ ...tripFolder, unreadable: ['f2'] });
        const res = await migrateGroup(tripGroup, deps, { apply: true, deleteOld: true });
        expect(res.status).toBe('error');
        expect(res.reason).toMatch(/illisible.*IMG_2.*Drive intact/);
        expect(deps.execute).not.toHaveBeenCalled();
        expect(trashed).toEqual([]);
        expect(r2.size).toBe(0);
    });

    it('UPDATE à 0 ligne (référence modifiée entre-temps) : sautée, jamais de corbeille', async () => {
        const { deps, trashed } = makeDeps(tripFolder, 0);
        const res = await migrateGroup(tripGroup, deps, { apply: true, deleteOld: true });
        expect(res.status).toBe('skipped');
        expect(trashed).toEqual([]);
        expect(journalEntries(res)).toEqual([]);
    });

    it('dossier introuvable sur Drive : erreur', async () => {
        const { deps } = makeDeps({ items: {} });
        const res = await migrateGroup(tripGroup, deps, { apply: true, deleteOld: false });
        expect(res.status).toBe('error');
        expect(res.reason).toMatch(/introuvable/);
    });

    it('id mock-… (preview) : ignoré et signalé, sans appel Drive', async () => {
        const { deps } = makeDeps(tripFolder);
        const res = await migrateGroup({ ...tripGroup, driveId: 'mock-folder-drive-123' }, deps, { apply: true, deleteOld: true });
        expect(res.status).toBe('ignored');
        expect(res.reason).toMatch(/mock/);
        expect(deps.drive.get).not.toHaveBeenCalled();
    });

    it('ligne sans UL ou dossier multi-UL : sauté et signalé, rien n\'est copié', async () => {
        const { deps } = makeDeps(tripFolder);
        const noUl = group([{ kind: 'trip', rowId: 't', ulSegment: null, name: 'VSAV 1' }], 'drv-trip');
        expect((await migrateGroup(noUl, deps, { apply: true, deleteOld: true })).status).toBe('skipped');
        const multi = group([
            { kind: 'trip', rowId: 't1', ulSegment: 'paris-18', name: 'VSAV 1' },
            { kind: 'trip', rowId: 't2', ulSegment: 'lyon-3', name: 'VSAV 1' },
        ], 'drv-trip');
        const res = await migrateGroup(multi, deps, { apply: true, deleteOld: true });
        expect(res.status).toBe('skipped');
        expect(res.reason).toMatch(/plusieurs UL/);
        expect(deps.drive.get).not.toHaveBeenCalled();
        expect(deps.execute).not.toHaveBeenCalled();
    });

    it('horodatage de repli si Drive ne donne pas createdTime', async () => {
        const items = { ...tripFolder.items, 'drv-trip': { ...tripFolder.items['drv-trip'], createdTime: null } };
        const { deps } = makeDeps({ items });
        deps.now = () => new Date('2026-07-01T08:05:09Z');
        const res = await migrateGroup(tripGroup, deps, { apply: false, deleteOld: false });
        expect(res.targets[0].newRef).toBe(`trip-photos/paris-18/vsav-1-20260701-100509-${stableHex('drv-trip', 4)}`);
    });
});

describe('migrateGroup — même id Drive sur deux types', () => {
    const shared: FakeDrive = {
        items: {
            d: { id: 'd', name: 'x', mimeType: FOLDER, createdTime: CREATED },
            a: { id: 'a', name: 'a.jpg', mimeType: 'image/jpeg', parent: 'd' },
        },
    };
    const g = group([
        { kind: 'incident', rowId: 'i1', ulSegment: 'paris-18', name: 'VSAV 1' },
        { kind: 'mission-com', rowId: 'm1', ulSegment: 'paris-18', name: 'Maraude' },
    ], 'd');

    it('chaque type est repointé, la corbeille n\'intervient qu\'une fois, après tous les UPDATE', async () => {
        const { deps, trashed } = makeDeps(shared);
        const res = await migrateGroup(g, deps, { apply: true, deleteOld: true });
        expect(res.status).toBe('migrated');
        expect(res.targets.map((t) => t.newRef?.split('/')[0])).toEqual(['incident-photos', 'mission-com-photos']);
        expect(vi.mocked(deps.execute)).toHaveBeenCalledTimes(2);
        expect(trashed).toEqual(['d']);
        expect(vi.mocked(deps.execute).mock.invocationCallOrder[1])
            .toBeLessThan(vi.mocked(deps.drive.trash).mock.invocationCallOrder[0]);
    });

    it('un type non repointé (modifié entre-temps) : dossier Drive conservé', async () => {
        const { deps, trashed } = makeDeps(shared, (sql) => (sql.includes('IncidentReport') ? 0 : 1));
        const res = await migrateGroup(g, deps, { apply: true, deleteOld: true });
        expect(res.status).toBe('migrated');
        expect(res.targets.map((t) => t.updated)).toEqual([false, true]);
        expect(trashed).toEqual([]);
        expect(journalEntries(res).map((e) => e.table)).toEqual(['mission_reports']);
    });
});

describe('migrateGroup — incident, mission, rapport signé', () => {
    it('incident : photos à plat et anciens sous-dossiers incident-…, à plat sur R2', async () => {
        const { deps } = makeDeps({
            items: {
                inc: { id: 'inc', name: 'x', mimeType: FOLDER, createdTime: CREATED },
                a: { id: 'a', name: 'a.jpg', mimeType: 'image/jpeg', parent: 'inc' },
                sub: { id: 'sub', name: 'incident-1234', mimeType: FOLDER, parent: 'inc' },
                b: { id: 'b', name: 'b.jpg', mimeType: 'image/jpeg', parent: 'sub' },
            },
        });
        const res = await migrateGroup(group([{ kind: 'incident', rowId: 'i1', ulSegment: 'paris-18', name: 'VSAV 1' }], 'inc'), deps, { apply: true, deleteOld: false });
        expect(res.status).toBe('migrated');
        expect(res.targets[0].newRef).toBe(`incident-photos/paris-18/vsav-1-20261108-143000-${stableHex('inc', 4)}`);
        expect(res.targets[0].files.every((f) => f.key.split('/').length === 4)).toBe(true);
        expect(vi.mocked(deps.execute).mock.calls[0][0].sql).toContain('"IncidentReport" SET driveFolderId');
    });

    it('photos de mission : images et PDF repris, le reste listé comme non repris', async () => {
        const { deps } = makeDeps({
            items: {
                mc: { id: 'mc', name: 'Maraude-2026-11-08', mimeType: FOLDER, createdTime: CREATED },
                p: { id: 'p', name: 'p.jpg', mimeType: 'image/jpeg', parent: 'mc' },
                d: { id: 'd', name: 'affiche.pdf', mimeType: 'application/pdf', parent: 'mc' },
                z: { id: 'z', name: 'notes.txt', mimeType: 'text/plain', parent: 'mc' },
            },
        });
        const g = group([
            { kind: 'mission-com', rowId: 'm1', ulSegment: 'paris-18', name: 'Maraude' },
            { kind: 'mission-com', rowId: 'm2', ulSegment: 'paris-18', name: 'Maraude' },
        ], 'mc');
        const res = await migrateGroup(g, deps, { apply: true, deleteOld: false });
        expect(res.targets[0].newRef).toBe(`mission-com-photos/paris-18/maraude-20261108-143000-${stableHex('mc', 4)}`);
        expect(res.targets[0].files).toHaveLength(2);
        expect(res.ignoredFiles).toEqual(['notes.txt']);
        expect(vi.mocked(deps.execute).mock.calls[0][0].sql).toBe('UPDATE "mission_reports" SET drive_folder_id = ? WHERE drive_folder_id = ?');
        expect(journalEntries(res).map((e) => e.rowId)).toEqual(['m1', 'm2']);
    });

    it('rapport signé : la colonne reçoit la clé complète du fichier', async () => {
        const { deps, trashed } = makeDeps({
            items: { sr: { id: 'sr', name: 'Rapport DPS.pdf', mimeType: 'application/pdf', createdTime: CREATED } },
        });
        const res = await migrateGroup(group([{ kind: 'mission-report', rowId: 'm1', ulSegment: 'paris-18', name: 'DPS Marathon' }], 'sr'), deps, { apply: true, deleteOld: true });
        expect(res.status).toBe('migrated');
        expect(res.targets[0].newRef).toBe(`mission-report-photo/paris-18/dps-marathon-20261108-143000-${stableHex('sr', 4)}/${stableHex('sr', 8)}-rapport-dps.pdf`);
        const call = vi.mocked(deps.execute).mock.calls[0][0];
        expect(call.sql).toContain('SET signed_report_drive_id = ?');
        expect(call.args).toEqual([res.targets[0].newRef, 'sr']);
        expect(trashed).toEqual(['sr']);
    });

    it('référence qui n\'est pas un dossier (photos) : erreur', async () => {
        const { deps } = makeDeps({ items: { f: { id: 'f', name: 'x.jpg', mimeType: 'image/jpeg', createdTime: CREATED } } });
        const res = await migrateGroup(group([{ kind: 'mission-com', rowId: 'm1', ulSegment: 'paris-18', name: 'M' }], 'f'), deps, { apply: true, deleteOld: false });
        expect(res.status).toBe('error');
        expect(deps.execute).not.toHaveBeenCalled();
    });

    it('corbeille impossible : migration maintenue, motif signalé', async () => {
        const { deps } = makeDeps({ items: { sr: { id: 'sr', name: 'r.jpg', mimeType: 'image/jpeg', createdTime: CREATED } } });
        vi.mocked(deps.drive.trash).mockRejectedValueOnce(new Error('quota'));
        const res = await migrateGroup(group([{ kind: 'mission-report', rowId: 'm1', ulSegment: 'paris-18', name: 'M' }], 'sr'), deps, { apply: true, deleteOld: true });
        expect(res.status).toBe('migrated');
        expect(res.trashed).toBe(false);
        expect(res.reason).toMatch(/corbeille/);
    });
});

describe('collectDriveSources / copyDriveSources (réutilisés par l\'envoi du rendu)', () => {
    it('copie tout ou rien : un fichier illisible retire les objets déjà écrits et lève', async () => {
        const { deps, r2 } = makeDeps({ ...tripFolder, unreadable: ['f2'] });
        const root = tripFolder.items['drv-trip'];
        const { sources } = await collectDriveSources('trip', root, deps.drive);
        const planned = planDriveFiles(sources, PREFIX, false);
        await expect(copyDriveSources(sources, planned, deps)).rejects.toThrow(/illisible/);
        expect(r2.size).toBe(0);
    });
});
