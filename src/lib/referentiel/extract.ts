/**
 * Extraction du texte d'un PDF distant, page par page, côté serveur.
 *
 * pdf.js lit le fichier par requêtes `Range` sur l'URL signée R2 : on ne
 * télécharge ni ne garde jamais le PDF entier en mémoire — seules les pages
 * demandées (et la table de références) sont lues.
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

/** Nombre de pages du PDF. */
export async function countPages(url: string): Promise<number> {
    const { getDocument } = await loadPdfjs();
    const task = getDocument({ url, disableAutoFetch: true, disableStream: true, verbosity: 0 });
    try {
        return (await task.promise).numPages;
    } finally {
        await task.destroy();
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
export async function extractPages(url: string, from: number, to: number, options: ExtractOptions = {}): Promise<ExtractedPage[]> {
    const { getDocument } = await loadPdfjs();
    const task = getDocument({ url, disableAutoFetch: true, disableStream: true, verbosity: 0 });
    try {
        const doc = await task.promise;
        const last = Math.min(to, doc.numPages);
        const pages: ExtractedPage[] = [];
        for (let n = Math.max(1, from); n <= last; n++) {
            if (options.deadline !== undefined && pages.length > 0 && Date.now() > options.deadline) break;
            const page = await doc.getPage(n);
            const content = await page.getTextContent();
            const { title, bodyLines } = splitPageHeader(toLines(content.items));
            pages.push({ page: n, title, body: bodyLines.join('\n') });
            page.cleanup();
        }
        return pages;
    } finally {
        await task.destroy();
    }
}
