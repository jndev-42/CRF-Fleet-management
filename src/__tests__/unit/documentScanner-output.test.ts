import { describe, it, expect, vi, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
    MAX_SCAN_BYTES,
    MAX_SCAN_PAGES,
    SCAN_PDF_NAME,
    ScanPageLimitError,
    ScanTooLargeError,
    buildPdf,
    encodeCanvasToJpeg,
    pagesToPdfFile,
    type EncodedPage,
    type PageEncoder,
} from '@/lib/documentScanner/output';

// JPEG 4x4 blanc valide (généré avec sharp)
const TINY_JPEG = Uint8Array.from(
    atob('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z'),
    (c) => c.charCodeAt(0),
);

const page = (): HTMLCanvasElement => document.createElement('canvas');
const encoded = (): EncodedPage => ({ jpeg: TINY_JPEG, width: 100, height: 150 });
const okEncoder: PageEncoder = async () => encoded();

describe('documentScanner/output', () => {
    it('assemble les pages en un seul PDF', async () => {
        const bytes = await buildPdf([encoded(), { ...encoded(), width: 150, height: 100 }]);
        const pdf = await PDFDocument.load(bytes);
        expect(pdf.getPageCount()).toBe(2);
    });

    it('produit compte-rendu-scan.pdf, même pour une seule page', async () => {
        const file = await pagesToPdfFile([page()], { encode: okEncoder });
        expect(file.name).toBe(SCAN_PDF_NAME);
        expect(file.type).toBe('application/pdf');
        const pdf = await PDFDocument.load(await file.arrayBuffer());
        expect(pdf.getPageCount()).toBe(1);
    });

    it('recompresse progressivement puis échoue si le PDF reste trop lourd', async () => {
        const calls: Array<[number, number]> = [];
        const encode: PageEncoder = async (_p, quality, scale) => {
            calls.push([quality, scale]);
            return encoded();
        };
        await expect(pagesToPdfFile([page()], { encode, maxBytes: 10 })).rejects.toBeInstanceOf(ScanTooLargeError);
        expect(calls).toHaveLength(5);
        expect(calls[0][0]).toBeGreaterThan(calls[4][0]);
        expect(calls[4][1]).toBeLessThan(1);
    });

    it("s'arrête au premier palier qui passe sous la limite", async () => {
        let n = 0;
        const encode: PageEncoder = async () => {
            n += 1;
            return encoded();
        };
        await pagesToPdfFile([page(), page()], { encode });
        expect(n).toBe(2);
    });

    it('refuse plus de 10 pages', async () => {
        const pages = Array.from({ length: MAX_SCAN_PAGES + 1 }, page);
        await expect(pagesToPdfFile(pages, { encode: okEncoder })).rejects.toBeInstanceOf(ScanPageLimitError);
    });

    it('refuse une liste vide', async () => {
        await expect(pagesToPdfFile([], { encode: okEncoder })).rejects.toThrow();
    });

    it('reste sous la limite serveur de 4,2 Mo par fichier', () => {
        expect(MAX_SCAN_BYTES).toBeLessThan(4.2 * 1024 * 1024);
    });
});

describe('documentScanner/output — encodeCanvasToJpeg', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const stubCanvas = () => {
        const drawImage = vi.fn();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
        const toBlob = vi
            .spyOn(HTMLCanvasElement.prototype, 'toBlob')
            .mockImplementation((cb) => cb(new Blob([TINY_JPEG], { type: 'image/jpeg' })));
        return { drawImage, toBlob };
    };

    const sizedCanvas = (w: number, h: number) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    };

    it('encode sans redimensionner à l\'échelle 1', async () => {
        const { drawImage, toBlob } = stubCanvas();
        const out = await encodeCanvasToJpeg(sizedCanvas(200, 100), 0.85, 1);
        expect(out).toMatchObject({ width: 200, height: 100 });
        expect(out.jpeg.byteLength).toBe(TINY_JPEG.byteLength);
        expect(drawImage).not.toHaveBeenCalled();
        expect(toBlob.mock.calls[0][2]).toBe(0.85);
    });

    it('redimensionne quand l\'échelle est inférieure à 1', async () => {
        const { drawImage } = stubCanvas();
        const out = await encodeCanvasToJpeg(sizedCanvas(200, 100), 0.6, 0.5);
        expect(out).toMatchObject({ width: 100, height: 50 });
        expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 0, 0, 100, 50);
    });

    it('échoue si le navigateur ne produit pas de JPEG', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(null));
        await expect(encodeCanvasToJpeg(sizedCanvas(10, 10), 0.8, 1)).rejects.toThrow();
    });
});
