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

    it('transmits stage and vehicleName when existingFolderId is present', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, folderId: 'existing-123', subfolderId: 'sub-456', fileIds: ['f-1'] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { uploadFilesToDriveSafely } = await import('@/lib/imageCompression');
        const file = new File(['test'], 'photo.pdf', { type: 'application/pdf' });

        await uploadFilesToDriveSafely({
            files: [file],
            vehicleName: 'VSAV 01',
            date: '2026-08-10_21-12',
            stage: 'rendu',
            existingFolderId: 'existing-123',
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const options = fetchMock.mock.calls[0][1];
        const body = options.body as FormData;

        expect(body.get('stage')).toBe('rendu');
        expect(body.get('vehicleName')).toBe('VSAV 01');
        expect(body.get('date')).toBe('2026-08-10_21-12');
        expect(body.get('existingFolderId')).toBe('existing-123');

        vi.unstubAllGlobals();
    });
});
