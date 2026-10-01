import { RefObject, useEffect, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';

const LOAD_ERROR = 'Impossible de charger le guide.';

/**
 * Charge un PDF avec pdf.js, importé dynamiquement : la page qui affiche la
 * liseuse n'en paie le poids qu'à l'ouverture.
 *
 * Build `legacy` : le build moderne exige des API JavaScript encore absentes de
 * nombreux téléphones (ex. `Map.prototype.getOrInsertComputed`).
 *
 * Le fichier est récupéré par `fetch` puis passé en mémoire, plutôt que par
 * l'URL : la route ne gère pas les requêtes partielles (`Range`), et un refus
 * (404, 403) doit afficher le message du serveur.
 */
export function useGuidePdf(src: string) {
    const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        // La tâche de chargement porte la destruction du document (et de son worker).
        let loadingTask: PDFDocumentLoadingTask | null = null;

        (async () => {
            try {
                const res = await fetch(src);
                if (!res.ok) {
                    const body = await res.json().catch(() => null) as { error?: string } | null;
                    throw new Error(body?.error || LOAD_ERROR);
                }
                const data = new Uint8Array(await res.arrayBuffer());
                const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
                pdfjs.GlobalWorkerOptions.workerSrc = new URL(
                    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
                    import.meta.url,
                ).toString();
                if (cancelled) return;
                loadingTask = pdfjs.getDocument({ data });
                const loaded = await loadingTask.promise;
                if (!cancelled) setDoc(loaded);
            } catch (e: unknown) {
                if (!cancelled) setError(e instanceof Error ? e.message : LOAD_ERROR);
            }
        })();

        return () => {
            cancelled = true;
            loadingTask?.destroy();
        };
    }, [src]);

    return { doc, error, setError };
}

/**
 * Dessine une page dans le canvas, ajustée à `width` (px CSS) et nette sur
 * écran haute densité. Une page quittée en cours de rendu annule sa tâche.
 */
export function useGuidePageRender(
    doc: PDFDocumentProxy | null,
    pageNumber: number,
    width: number,
    canvasRef: RefObject<HTMLCanvasElement | null>,
    onError: (message: string) => void,
) {
    useEffect(() => {
        if (!doc || !canvasRef.current || width <= 0) return;
        let cancelled = false;
        let task: RenderTask | null = null;

        (async () => {
            try {
                const page = await doc.getPage(pageNumber);
                const canvas = canvasRef.current;
                if (cancelled || !canvas) return;
                const ratio = window.devicePixelRatio || 1;
                const cssScale = width / page.getViewport({ scale: 1 }).width;
                const viewport = page.getViewport({ scale: cssScale * ratio });
                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
                canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
                task = page.render({ canvas, viewport });
                await task.promise;
            } catch (e: unknown) {
                if (cancelled || (e instanceof Error && e.name === 'RenderingCancelledException')) return;
                onError("Impossible d'afficher cette page.");
            }
        })();

        return () => {
            cancelled = true;
            task?.cancel();
        };
    }, [doc, pageNumber, width, canvasRef, onError]);
}

/** Largeur intérieure d'un élément, suivie au redimensionnement. */
export function useElementWidth(ref: RefObject<HTMLElement | null>) {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const update = () => setWidth(el.clientWidth);
        update();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref]);
    return width;
}
