/**
 * Extraction du texte d'un PDF distant, page par page, côté serveur.
 *
 * pdf.js lit le fichier UNIQUEMENT par plages d'octets, via un
 * `PDFDataRangeTransport` branché sur une `PdfSource` (R2 en production) : on ne
 * télécharge ni ne garde jamais le PDF entier en mémoire — seules les pages
 * demandées (et la table de références) sont lues.
 *
 * Pourquoi pas `getDocument({ url })` : pdf.js commence alors par un GET complet
 * du fichier, qu'il n'interrompt pas assez tôt — sur Vercel, ~180 Mo téléchargés
 * et ~500 Mo de mémoire à CHAQUE appel, jusqu'au dépassement de `maxDuration`.
 */
import path from 'path';
import { pathToFileURL } from 'url';
import { splitPageHeader } from './pageTitle';

/**
 * Charge pdf.js (build `legacy`, sans API récentes) et lui indique où trouver son
 * worker. Côté serveur il tourne sur le fil principal (« fake worker ») et charge
 * `pdf.worker.mjs` par un `import()` que webpack n'intercepte pas : le chemin par
 * défaut (relatif au module courant) serait faux une fois la route empaquetée.
 * On passe donc l'URL absolue du fichier ; `outputFileTracingIncludes`
 * (next.config.ts) l'embarque dans la fonction Vercel.
 */
async function loadPdfjs() {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
        path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
    ).href;
    return pdfjs;
}

export interface ExtractedPage {
    page: number;
    title: string;
    body: string;
}

interface TextItem {
    str: string;
    hasEOL?: boolean;
}

function isTextItem(item: unknown): item is TextItem {
    return typeof item === 'object' && item !== null && typeof (item as TextItem).str === 'string';
}

/** Regroupe les fragments de texte d'une page en lignes de lecture. */
function toLines(items: unknown[]): string[] {
    const lines: string[] = [];
    let current = '';
    for (const item of items) {
        if (!isTextItem(item)) continue;
        current += item.str;
        if (item.hasEOL) {
            lines.push(current);
            current = '';
        }
    }
    if (current) lines.push(current);
    return lines;
}

/** Accès par plages d'octets à un PDF distant. */
export interface PdfSource {
    /** Taille totale du fichier, en octets. */
    size(): Promise<number>;
    /** Octets `start` (inclus) à `end` (exclu). */
    read(start: number, end: number): Promise<Uint8Array>;
}

/**
 * Plages lues par pdf.js : 512 Ko plutôt que 64 Ko par défaut — chaque plage est
 * une requête R2, et ce sont les allers-retours, pas le volume, qui coûtent.
 */
const RANGE_CHUNK_SIZE = 512 * 1024;

interface OpenedDocument {
    doc: { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }>; cleanup(): void }> };
    /** Rejette dès qu'une lecture de plage échoue (pdf.js, lui, attendrait indéfiniment). */
    guard<T>(promise: Promise<T>): Promise<T>;
    destroy(): Promise<void>;
}

async function openDocument(source: PdfSource): Promise<OpenedDocument> {
    const pdfjs = await loadPdfjs();
    let fail: (error: unknown) => void = () => undefined;
    const failure = new Promise<never>((_, reject) => { fail = reject; });
    failure.catch(() => undefined); // évite un rejet non géré si personne n'attend plus

    class SourceTransport extends pdfjs.PDFDataRangeTransport {
        requestDataRange(begin: number, end: number) {
            source.read(begin, end).then(chunk => this.onDataRange(begin, chunk), fail);
        }
    }

    const transport = new SourceTransport(await source.size(), null);
    const task = pdfjs.getDocument({
        range: transport,
        rangeChunkSize: RANGE_CHUNK_SIZE,
        disableAutoFetch: true,
        disableStream: true,
        verbosity: 0,
    });
    const guard = <T,>(promise: Promise<T>) => Promise.race([promise, failure]);
    try {
        const doc = await guard(task.promise);
        return { doc, guard, destroy: () => task.destroy() };
    } catch (e: unknown) {
        await task.destroy();
        throw e;
    }
}

/** Nombre de pages du PDF. */
export async function countPages(source: PdfSource): Promise<number> {
    const opened = await openDocument(source);
    try {
        return opened.doc.numPages;
    } finally {
        await opened.destroy();
    }
}

export interface ExtractOptions {
    /** Instant (ms epoch) passé lequel on s'arrête : le lot revient plus court, sans erreur. */
    deadline?: number;
}

/**
 * Extrait les pages `from`..`to` (numérotées à partir de 1, bornes incluses,
 * `to` tronqué au nombre de pages réel). Avec `deadline`, s'arrête proprement
 * entre deux pages : l'appelant reprend à la page suivant la dernière rendue.
 */
export async function extractPages(source: PdfSource, from: number, to: number, options: ExtractOptions = {}): Promise<ExtractedPage[]> {
    const { doc, guard, destroy } = await openDocument(source);
    try {
        const last = Math.min(to, doc.numPages);
        const pages: ExtractedPage[] = [];
        for (let n = Math.max(1, from); n <= last; n++) {
            if (options.deadline !== undefined && pages.length > 0 && Date.now() > options.deadline) break;
            const page = await guard(doc.getPage(n));
            const content = await guard(page.getTextContent());
            const { title, bodyLines } = splitPageHeader(toLines(content.items));
            pages.push({ page: n, title, body: bodyLines.join('\n') });
            page.cleanup();
        }
        return pages;
    } finally {
        await destroy();
    }
}
