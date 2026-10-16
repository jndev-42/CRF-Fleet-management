import { PDFDocument } from 'pdf-lib';

export const SCAN_PDF_NAME = 'compte-rendu-scan.pdf';
export const MAX_SCAN_PAGES = 10;
/** Limite serveur de 4,2 Mo par fichier, avec une marge. */
export const MAX_SCAN_BYTES = 4 * 1024 * 1024;

const PDF_LONG_SIDE = 842; // A4 en points

/** Paliers de recompression progressive : qualité JPEG puis réduction de dimension. */
export const COMPRESSION_STEPS: ReadonlyArray<{ quality: number; scale: number }> = [
    { quality: 0.85, scale: 1 },
    { quality: 0.7, scale: 1 },
    { quality: 0.6, scale: 0.8 },
    { quality: 0.5, scale: 0.65 },
    { quality: 0.4, scale: 0.5 },
];

export interface EncodedPage {
    jpeg: Uint8Array;
    width: number;
    height: number;
}

export type PageEncoder = (page: HTMLCanvasElement, quality: number, scale: number) => Promise<EncodedPage>;

export class ScanTooLargeError extends Error {
    constructor() {
        super('Le document scanné est trop volumineux. Réduisez le nombre de pages et réessayez.');
        this.name = 'ScanTooLargeError';
    }
}

export class ScanPageLimitError extends Error {
    constructor() {
        super(`Un scan est limité à ${MAX_SCAN_PAGES} pages.`);
        this.name = 'ScanPageLimitError';
    }
}

/** Encode un canvas en JPEG (optionnellement réduit). */
export const encodeCanvasToJpeg: PageEncoder = async (page, quality, scale) => {
    const width = Math.max(1, Math.round(page.width * scale));
    const height = Math.max(1, Math.round(page.height * scale));
    let source = page;
    if (scale !== 1) {
        source = document.createElement('canvas');
        source.width = width;
        source.height = height;
        source.getContext('2d')?.drawImage(page, 0, 0, width, height);
    }
    const blob = await new Promise<Blob | null>((resolve) => source.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error("Impossible d'encoder la page scannée.");
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height };
};

/** Assemble des pages JPEG en un seul PDF. */
export async function buildPdf(pages: EncodedPage[]): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    for (const page of pages) {
        const image = await pdf.embedJpg(page.jpeg);
        const ratio = PDF_LONG_SIDE / Math.max(page.width, page.height);
        const w = page.width * ratio;
        const h = page.height * ratio;
        const pdfPage = pdf.addPage([w, h]);
        pdfPage.drawImage(image, { x: 0, y: 0, width: w, height: h });
    }
    return pdf.save();
}

/**
 * Produit un unique PDF `compte-rendu-scan.pdf` à partir des pages redressées,
 * en recompressant progressivement pour rester sous `maxBytes`.
 */
export async function pagesToPdfFile(
    pages: HTMLCanvasElement[],
    { maxBytes = MAX_SCAN_BYTES, encode = encodeCanvasToJpeg }: { maxBytes?: number; encode?: PageEncoder } = {},
): Promise<File> {
    if (pages.length === 0) throw new Error('Aucune page à enregistrer.');
    if (pages.length > MAX_SCAN_PAGES) throw new ScanPageLimitError();

    for (const step of COMPRESSION_STEPS) {
        const encoded: EncodedPage[] = [];
        for (const page of pages) {
            encoded.push(await encode(page, step.quality, step.scale));
        }
        const bytes = await buildPdf(encoded);
        if (bytes.byteLength <= maxBytes) {
            return new File([bytes as BlobPart], SCAN_PDF_NAME, { type: 'application/pdf' });
        }
    }
    throw new ScanTooLargeError();
}
