import { describe, it, expect } from 'vitest';
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
});
