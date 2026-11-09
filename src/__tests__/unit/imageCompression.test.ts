import { describe, it, expect, vi } from 'vitest';
import { compressImage, compressImages } from '@/lib/imageCompression';

describe('imageCompression utility', () => {
    it('returns non-image files unchanged', async () => {
        const pdfFile = new File(['%PDF-1.4...'], 'test.pdf', { type: 'application/pdf' });
        const result = await compressImage(pdfFile);
        expect(result).toBe(pdfFile);
    });

    it('handles multiple files correctly with compressImages', async () => {
        const pdf1 = new File(['pdf1'], 'doc1.pdf', { type: 'application/pdf' });
        const pdf2 = new File(['pdf2'], 'doc2.pdf', { type: 'application/pdf' });
        const results = await compressImages([pdf1, pdf2]);
        expect(results).toHaveLength(2);
        expect(results[0]).toBe(pdf1);
        expect(results[1]).toBe(pdf2);
    });

    it('uploadMediaSafely : envoie type, véhicule, étape et dossier existant vers /api/media/upload', async () => {
        const ref = 'trip-photos/paris-18/vsav-1-20261108-143000-a1b2';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, folderId: ref, subfolderId: `${ref}/rendu`, fileIds: [`${ref}/rendu/0a1b2c3d-photo.pdf`] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { uploadMediaSafely } = await import('@/lib/imageCompression');
        const file = new File(['test'], 'photo.pdf', { type: 'application/pdf' });

        const result = await uploadMediaSafely({
            files: [file],
            type: 'trip-photos',
            vehicleId: 'veh-1',
            stage: 'rendu',
            existingFolderId: ref,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('/api/media/upload');
        const body = fetchMock.mock.calls[0][1].body as FormData;
        expect(body.get('type')).toBe('trip-photos');
        expect(body.get('vehicleId')).toBe('veh-1');
        expect(body.get('stage')).toBe('rendu');
        expect(body.get('existingFolderId')).toBe(ref);
        expect(result).toEqual({ success: true, folderId: ref, subfolderId: `${ref}/rendu`, fileIds: [`${ref}/rendu/0a1b2c3d-photo.pdf`] });

        vi.unstubAllGlobals();
    });

    it('uploadMediaSafely : renvoie l\'erreur du serveur', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Interdit' }) }));
        const { uploadMediaSafely } = await import('@/lib/imageCompression');
        const result = await uploadMediaSafely({ files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })], type: 'incident-photos', vehicleId: 'veh-1' });
        expect(result.success).toBe(false);
        expect(result.error).toBe('Interdit');
        vi.unstubAllGlobals();
    });

    it('uploadMediaSafely : sans fichier, aucun appel réseau', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { uploadMediaSafely } = await import('@/lib/imageCompression');
        const result = await uploadMediaSafely({ files: [], type: 'mission-com-photos', name: 'Maraude' });
        expect(result).toEqual({ success: true, folderId: '', subfolderId: undefined, fileIds: [] });
        expect(fetchMock).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('mediaFileUrl / mediaListUrl : R2 ou ancien proxy Drive selon la référence', async () => {
        const { mediaFileUrl, mediaListUrl } = await import('@/lib/imageCompression');
        const ref = 'incident-photos/paris-18/vsav-1-20261108-143000-a1b2';
        expect(mediaFileUrl(`${ref}/0a1b2c3d-x.jpg`)).toBe(`/api/media/file?key=${encodeURIComponent(`${ref}/0a1b2c3d-x.jpg`)}`);
        expect(mediaFileUrl('1XyZdriveFile')).toBe('/api/drive/photos/1XyZdriveFile');
        expect(mediaListUrl(ref, { flat: true })).toBe(`/api/media/photos?folderId=${encodeURIComponent(ref)}&flat=true`);
        expect(mediaListUrl('1AbCdriveFolder')).toBe('/api/drive/photos?folderId=1AbCdriveFolder');
    });
});
