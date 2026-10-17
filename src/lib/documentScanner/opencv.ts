import type { Quad } from './geometry';
import { outputSize, scaleQuad } from './geometry';
import { createTracker } from './matTracker';
import { findDocumentQuad } from './documentDetection';

// Seuls les types sont importés ici : le moteur (~9 Mo) n'est chargé qu'à l'appel de loadOpenCv().
export type OpenCv = typeof import('@techstark/opencv-js');
export type Mat = InstanceType<OpenCv['Mat']>;

export { findDocumentQuad };

/** `original` : redressement seul, sans normalisation ni seuillage ; `color` : contraste amélioré ; `bw` : noir & blanc. */
export type EnhanceMode = 'original' | 'color' | 'bw';

/** Taille d'analyse (plus grande dimension) : légère en direct, plus fine à la capture. */
export const LIVE_ANALYSIS_SIZE = 480;
export const CAPTURE_ANALYSIS_SIZE = 1000;

let loadPromise: Promise<OpenCv> | null = null;

export const OPENCV_LOAD_TIMEOUT_MS = 20_000;

interface RawCv {
    Mat?: unknown;
    then?: unknown;
    onRuntimeInitialized?: () => void;
}

async function initOpenCv(): Promise<OpenCv> {
    const { getOpenCvBox } = await import('./opencvModule');
    const cv = getOpenCvBox().cv as RawCv;
    return new Promise<OpenCv>((resolve) => {
        const ready = () => {
            // Ne jamais résoudre une promesse avec un objet qui garde son `then` : il serait ré-adopté sans fin
            delete cv.then;
            resolve(cv as unknown as OpenCv);
        };
        if (typeof cv.Mat === 'function') ready();
        else cv.onRuntimeInitialized = ready;
    });
}

/** Charge OpenCV.js une seule fois (import dynamique + attente de l'init wasm, 20 s maximum). */
export function loadOpenCv(): Promise<OpenCv> {
    if (!loadPromise) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Délai dépassé au chargement du moteur de scan')), OPENCV_LOAD_TIMEOUT_MS);
        });
        loadPromise = Promise.race([initOpenCv(), timeout])
            .finally(() => clearTimeout(timer))
            .catch((e: unknown) => {
                loadPromise = null;
                throw e;
            });
    }
    return loadPromise;
}

// Un seul canvas d'analyse réutilisé (limite mémoire des canvas sur iOS Safari)
let analysisCanvas: HTMLCanvasElement | null = null;

/**
 * Détecte le document dans une source vidéo/canvas : la dessine dans le canvas d'analyse
 * (réduite à `analysisSize` px) puis délègue à `findDocumentQuad`.
 * Retourne les coins en coordonnées de la source, ou null.
 */
export function detectQuad(
    cv: OpenCv,
    source: HTMLCanvasElement | HTMLVideoElement,
    analysisSize = LIVE_ANALYSIS_SIZE,
    reference: Quad | null = null,
): Quad | null {
    const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!srcW || !srcH) return null;

    const scale = Math.min(1, analysisSize / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = (analysisCanvas ??= document.createElement('canvas'));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, w, h);

    const rgba = cv.matFromImageData(ctx.getImageData(0, 0, w, h));
    try {
        const quad = findDocumentQuad(cv, rgba, reference ? scaleQuad(reference, scale) : null);
        return quad ? scaleQuad(quad, 1 / scale) : null;
    } finally {
        rgba.delete();
    }
}

/**
 * Cœur du redressement (pur OpenCV, sans DOM) : image RGBA → perspective corrigée aux proportions
 * estimées, puis traitement selon `mode`. Retourne une nouvelle Mat que l'appelant doit libérer.
 */
export function warpMat(cv: OpenCv, src: Mat, quad: Quad, mode: EnhanceMode): Mat {
    const { width, height } = outputSize(quad, src.cols, src.rows);
    const { track, release } = createTracker();
    const out = new cv.Mat();

    try {
        const srcPts = track(cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y])));
        const dstPts = track(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]));
        const matrix = track(cv.getPerspectiveTransform(srcPts, dstPts));
        const size = new cv.Size(width, height);

        if (mode === 'original') {
            // Redressement seul : aucune normalisation ni seuillage
            cv.warpPerspective(src, out, matrix, size, cv.INTER_LINEAR, cv.BORDER_REPLICATE);
            return out;
        }

        const warped = track(new cv.Mat());
        cv.warpPerspective(src, warped, matrix, size, cv.INTER_LINEAR, cv.BORDER_REPLICATE);

        if (mode === 'bw') {
            const gray = track(new cv.Mat());
            cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
            cv.adaptiveThreshold(gray, out, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 12);
        } else {
            // Normalisation du fond : divise l'image par une version floutée (supprime ombres et éclairage inégal)
            const rgb = track(new cv.Mat());
            cv.cvtColor(warped, rgb, cv.COLOR_RGBA2RGB);
            const background = track(new cv.Mat());
            const kernelSize = (Math.max(3, Math.round(Math.max(width, height) / 30)) | 1);
            cv.GaussianBlur(rgb, background, new cv.Size(kernelSize, kernelSize), 0);
            const normalized = track(new cv.Mat());
            cv.divide(rgb, background, normalized, 255);
            cv.normalize(normalized, normalized, 0, 255, cv.NORM_MINMAX);
            cv.cvtColor(normalized, out, cv.COLOR_RGB2RGBA);
        }
        return out;
    } catch (e: unknown) {
        out.delete();
        throw e;
    } finally {
        release();
    }
}

/** Redresse la perspective du quadrilatère puis applique le traitement choisi (original, couleur, noir & blanc). */
export function warpAndEnhance(
    cv: OpenCv,
    image: HTMLCanvasElement | HTMLImageElement,
    quad: Quad,
    mode: EnhanceMode,
): HTMLCanvasElement {
    const src = cv.imread(image);
    try {
        const out = warpMat(cv, src, quad, mode);
        try {
            const canvas = document.createElement('canvas');
            cv.imshow(canvas, out);
            return canvas;
        } finally {
            out.delete();
        }
    } finally {
        src.delete();
    }
}
