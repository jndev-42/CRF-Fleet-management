// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const destroy = vi.fn(async () => undefined);
const getDocument = vi.fn();
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: (...args: unknown[]) => getDocument(...args),
}));

import { countPages, extractPages } from '@/lib/referentiel/extract';

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

beforeEach(() => {
    getDocument.mockReset();
    destroy.mockClear();
});

describe('countPages', () => {
    it('renvoie le nombre de pages, lit par Range et libère le document', async () => {
        mockDocument([fakePage(['a']), fakePage(['b'])]);
        expect(await countPages('https://r2.test/g.pdf')).toBe(2);
        expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://r2.test/g.pdf', disableAutoFetch: true, disableStream: true }));
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
        expect(await extractPages('u', 1, 1)).toEqual([
            { page: 1, title: 'Urgences vitales / Hémorragie / IV.B.1', body: 'Comprimer\nla plaie' },
        ]);
    });

    it('plafonne `to` au nombre de pages réel', async () => {
        mockDocument([fakePage(['un']), fakePage(['deux']), fakePage(['trois'])]);
        const pages = await extractPages('u', 2, 99);
        expect(pages.map(p => p.page)).toEqual([2, 3]);
    });

    it('s\'arrête entre deux pages au-delà de la date limite, en rendant au moins une page', async () => {
        mockDocument([fakePage(['un']), fakePage(['deux']), fakePage(['trois'])]);
        const pages = await extractPages('u', 1, 3, { deadline: Date.now() - 1000 });
        expect(pages.map(p => p.page)).toEqual([1]);
    });

    it('libère le document même si une page échoue', async () => {
        getDocument.mockReturnValue({
            promise: Promise.resolve({ numPages: 1, getPage: async () => { throw new Error('page illisible'); } }),
            destroy,
        });
        await expect(extractPages('u', 1, 1)).rejects.toThrow('page illisible');
        expect(destroy).toHaveBeenCalled();
    });
});
