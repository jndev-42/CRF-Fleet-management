// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const deletePrefix = vi.fn();
const listObjects = vi.fn();
const deleteMediaKey = vi.fn();

const slug = { value: 'paris-18' as string | null };
vi.mock('@/lib/db', () => ({
    db: { execute: vi.fn(async (stmt: { sql: string }) => ({ rows: stmt.sql.includes('UniteLocale') ? [{ slug: slug.value }] : [] })) },
}));
vi.mock('@/lib/r2', () => ({
    deletePrefix: (...a: unknown[]) => deletePrefix(...a),
    deleteMediaKey: (...a: unknown[]) => deleteMediaKey(...a),
    listObjects: (...a: unknown[]) => listObjects(...a),
    expenseUlSegment: (slug: unknown, ulId: string) => (typeof slug === 'string' && slug) || ulId,
}));

import { deleteMediaFile, deleteMediaFolder, deleteMediaRefIfUnshared, listMediaFiles, ulSegmentOf } from '@/lib/media/server';

beforeEach(() => {
    deletePrefix.mockReset();
    listObjects.mockReset();
    deleteMediaKey.mockReset();
    slug.value = 'paris-18';
});

describe('deleteMediaFolder', () => {
    it('préfixe R2 : supprime les objets du préfixe', async () => {
        deletePrefix.mockResolvedValue(3);
        expect(await deleteMediaFolder('trip-photos/paris-18/x')).toBe(true);
        expect(deletePrefix).toHaveBeenCalledWith('trip-photos/paris-18/x');
    });

    it('référence non R2 (id Drive résiduel, mock-…) : rien à supprimer, aucun appel', async () => {
        expect(await deleteMediaFolder('1AbCdrive')).toBe(true);
        expect(await deleteMediaFolder('mock-folder-123')).toBe(true);
        expect(deletePrefix).not.toHaveBeenCalled();
        expect(deleteMediaKey).not.toHaveBeenCalled();
    });

    it('échec : journalisé, ne lève jamais', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        deletePrefix.mockRejectedValue(new Error('R2 indisponible'));
        expect(await deleteMediaFolder('trip-photos/paris-18/x')).toBe(false);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('préfixe trop large (toute une UL) ou clé de fichier : refusé, rien supprimé', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(await deleteMediaFolder('trip-photos/paris-18')).toBe(false);
        expect(await deleteMediaFolder('trip-photos/paris-18/x/emprunt/0a1b2c3d-a.jpg')).toBe(false);
        expect(deletePrefix).not.toHaveBeenCalled();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('référence vide : rien à faire', async () => {
        expect(await deleteMediaFolder(null)).toBe(true);
        expect(deletePrefix).not.toHaveBeenCalled();
    });
});

describe('listMediaFiles / ulSegmentOf', () => {
    it('ne garde que les clés valides du dossier, avec étape, nom et type MIME', async () => {
        const ref = 'trip-photos/paris-18/x';
        listObjects.mockResolvedValue([`${ref}/rendu/0a1b2c3d-b.jpg`, `${ref}/emprunt/0a1b2c3d-a.png`, `${ref}/autre/z.jpg`, `${ref}/stray.jpg`]);
        expect(await listMediaFiles(ref)).toEqual([
            { id: `${ref}/emprunt/0a1b2c3d-a.png`, name: 'a.png', mimeType: 'image/png', stage: 'emprunt' },
            { id: `${ref}/rendu/0a1b2c3d-b.jpg`, name: 'b.jpg', mimeType: 'image/jpeg', stage: 'rendu' },
        ]);
        expect(listObjects).toHaveBeenCalledWith(`${ref}/`);
    });

    it('ulSegmentOf : slug de l\'UL', async () => {
        expect(await ulSegmentOf('ul-paris-18')).toBe('paris-18');
    });
});

describe('deleteMediaFile / deleteMediaRefIfUnshared', () => {
    it('rapport signé R2 : clé supprimée ; id Drive résiduel : rien à supprimer', async () => {
        expect(await deleteMediaFile('mission-report-photo/paris-18/x/0a1b2c3d-r.pdf')).toBe(true);
        expect(deleteMediaKey).toHaveBeenCalledWith('mission-report-photo/paris-18/x/0a1b2c3d-r.pdf');
        deleteMediaKey.mockClear();
        expect(await deleteMediaFile('1AbCdrive')).toBe(true);
        expect(deleteMediaKey).not.toHaveBeenCalled();
        expect(deletePrefix).not.toHaveBeenCalled();
    });

    it('non partagée : supprimée (dossier ou fichier selon le type)', async () => {
        deletePrefix.mockResolvedValue(1);
        expect(await deleteMediaRefIfUnshared('incident-photos/paris-18/x', 'folder')).toBe(true);
        expect(deletePrefix).toHaveBeenCalledWith('incident-photos/paris-18/x');
    });
});

describe('ulSegmentOf — slug commençant par un caractère non sûr', () => {
    it('retire les caractères initiaux hors [A-Za-z0-9_]', async () => {
        slug.value = '-x-paris';
        expect(await ulSegmentOf('ul-1')).toBe('x-paris');
    });
});
