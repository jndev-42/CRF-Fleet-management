// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const destroy = vi.fn(async () => undefined);
const getDocument = vi.fn();
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => {
    /** Copie minimale de la classe pdf.js : `onDataRange` est espionné par les tests. */
    class PDFDataRangeTransport {
        length: number;
        initialData: Uint8Array | null;
        onDataRange = vi.fn();
        constructor(length: number, initialData: Uint8Array | null) {
            this.length = length;
            this.initialData = initialData;
        }
    }
    return {
        GlobalWorkerOptions: { workerSrc: '' },
        PDFDataRangeTransport,
        getDocument: (...args: unknown[]) => getDocument(...args),
    };
});

import { countPages, extractPages, type PdfSource } from '@/lib/referentiel/extract';

/** Une page pdf.js factice : chaque entrée de `lines` devient un fragment terminé par un saut de ligne. */
function fakePage(lines: string[], trailing?: string) {
    const items: { str: string; hasEOL?: boolean }[] = lines.map(str => ({ str, hasEOL: true }));
    if (trailing) items.push({ str: trailing });
    return { getTextContent: async () => ({ items }), cleanup: vi.fn() };
}

function mockDocument(pages: ReturnType<typeof fakePage>[]) {
    getDocument.mockReturnValue({
        promise: Promise.resolve({ numPages: pages.length, getPage: async (n: number) => pages[n - 1] }),
        destroy,
    });
}

function fakeSource(size = 1000): PdfSource & { read: ReturnType<typeof vi.fn> } {
    return {
        size: vi.fn(async () => size),
        read: vi.fn(async (start: number, end: number) => new Uint8Array(end - start)),
    };
}

/** Le transport de plages passé à pdf.js lors du dernier `getDocument`. */
function lastTransport() {
    return getDocument.mock.calls.at(-1)![0].range as {
        length: number;
        requestDataRange(begin: number, end: number): void;
        onDataRange: ReturnType<typeof vi.fn>;
    };
}

beforeEach(() => {
    getDocument.mockReset();
    destroy.mockClear();
});

describe('countPages', () => {
    it('ouvre le PDF par plages seulement (jamais d\'URL) et libère le document', async () => {
        mockDocument([fakePage(['a']), fakePage(['b'])]);
        expect(await countPages(fakeSource(182_828_956))).toBe(2);
        const options = getDocument.mock.calls[0][0];
        expect(options.url).toBeUndefined();
        expect(options).toMatchObject({ disableAutoFetch: true, disableStream: true, rangeChunkSize: 512 * 1024 });
        expect(lastTransport().length).toBe(182_828_956);
        expect(destroy).toHaveBeenCalled();
    });
});

describe('transport de plages', () => {
    it('lit la plage demandée (fin exclue) et la remet à pdf.js', async () => {
        mockDocument([fakePage(['a'])]);
        const source = fakeSource();
        await countPages(source);
        const transport = lastTransport();
        transport.requestDataRange(100, 300);
        await vi.waitFor(() => expect(transport.onDataRange).toHaveBeenCalledWith(100, expect.any(Uint8Array)));
        expect(source.read).toHaveBeenCalledWith(100, 300);
        expect(transport.onDataRange.mock.calls[0][1]).toHaveLength(200);
    });

    it('fait échouer l\'extraction si une plage ne peut être lue, au lieu d\'attendre indéfiniment', async () => {
        const source = fakeSource();
        source.read.mockRejectedValueOnce(new Error('R2 indisponible'));
        let requested = false;
        getDocument.mockImplementation((options: { range: { requestDataRange(b: number, e: number): void } }) => ({
            // pdf.js demande une plage puis attend sa réponse : la promesse ne se résout jamais seule.
            promise: new Promise(() => {
                options.range.requestDataRange(0, 10);
                requested = true;
            }),
            destroy,
        }));
        await expect(extractPages(source, 1, 1)).rejects.toThrow('R2 indisponible');
        expect(requested).toBe(true);
        expect(destroy).toHaveBeenCalled();
    });
});

describe('extractPages', () => {
    it('regroupe les fragments en lignes (hasEOL), sépare titre et corps', async () => {
        mockDocument([
            fakePage([
                'Urgences vitales / Hémorragie / IV.B.1 DUOS / Pole santé',
                'Comprimer',
            ], 'la plaie'),
        ]);
        expect(await extractPages(fakeSource(), 1, 1)).toEqual([
            { page: 1, title: 'Urgences vitales / Hémorragie / IV.B.1', body: 'Comprimer\nla plaie' },
        ]);
    });

    it('plafonne `to` au nombre de pages réel', async () => {
        mockDocument([fakePage(['un']), fakePage(['deux']), fakePage(['trois'])]);
        const pages = await extractPages(fakeSource(), 2, 99);
        expect(pages.map(p => p.page)).toEqual([2, 3]);
    });

    it('s\'arrête entre deux pages au-delà de la date limite, en rendant au moins une page', async () => {
        mockDocument([fakePage(['un']), fakePage(['deux']), fakePage(['trois'])]);
        const pages = await extractPages(fakeSource(), 1, 3, { deadline: Date.now() - 1000 });
        expect(pages.map(p => p.page)).toEqual([1]);
    });

    it('libère le document même si une page échoue', async () => {
        getDocument.mockReturnValue({
            promise: Promise.resolve({ numPages: 1, getPage: async () => { throw new Error('page illisible'); } }),
            destroy,
        });
        await expect(extractPages(fakeSource(), 1, 1)).rejects.toThrow('page illisible');
        expect(destroy).toHaveBeenCalled();
    });
});
