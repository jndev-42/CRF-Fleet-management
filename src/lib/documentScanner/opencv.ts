import type { Point, Quad } from './geometry';
import { isConvexQuad, orderCorners, outputSize, polygonArea, scaleQuad } from './geometry';

// Seuls les types sont importés ici : le moteur (~9 Mo) n'est chargé qu'à l'appel de loadOpenCv().
export type OpenCv = typeof import('@techstark/opencv-js');

export type EnhanceMode = 'color' | 'bw';

const ANALYSIS_MAX_DIMENSION = 480;
const MIN_AREA_RATIO = 0.2;

interface Deletable {
    delete(): void;
}

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

function createTracker() {
    const mats: Deletable[] = [];
    return {
        track<T extends Deletable>(m: T): T {
            mats.push(m);
            return m;
        },
        release() {
            mats.forEach((m) => m.delete());
        },
    };
}

/**
 * Détecte le plus grand quadrilatère convexe (> 20 % du cadre).
 * Retourne les coins ordonnés en coordonnées de la source, ou null.
 */
export function detectQuad(cv: OpenCv, source: HTMLCanvasElement | HTMLVideoElement): Quad | null {
    const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!srcW || !srcH) return null;

    const scale = Math.min(1, ANALYSIS_MAX_DIMENSION / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = (analysisCanvas ??= document.createElement('canvas'));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, w, h);

    const { track, release } = createTracker();
    try {
        const rgba = track(cv.matFromImageData(ctx.getImageData(0, 0, w, h)));
        const gray = track(new cv.Mat());
        cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
        const edges = track(new cv.Mat());
        cv.Canny(gray, edges, 60, 160);
        const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
        cv.dilate(edges, edges, kernel);

        const contours = track(new cv.MatVector());
        const hierarchy = track(new cv.Mat());
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        const minArea = w * h * MIN_AREA_RATIO;
        let best: Point[] | null = null;
        let bestArea = 0;

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const approx = new cv.Mat();
            try {
                cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
                if (approx.rows !== 4) continue;
                const pts: Point[] = [];
                for (let k = 0; k < 4; k++) {
                    pts.push({ x: approx.intPtr(k, 0)[0], y: approx.intPtr(k, 0)[1] });
                }
                const area = polygonArea(pts);
                if (area >= minArea && area > bestArea && isConvexQuad(pts)) {
                    best = pts;
                    bestArea = area;
                }
            } finally {
                approx.delete();
                contour.delete();
            }
        }

        return best ? scaleQuad(orderCorners(best), 1 / scale) : null;
    } finally {
        release();
    }
}

/** Redresse la perspective du quadrilatère puis améliore le contraste. */
export function warpAndEnhance(
    cv: OpenCv,
    image: HTMLCanvasElement | HTMLImageElement,
    quad: Quad,
    mode: EnhanceMode,
): HTMLCanvasElement {
    const { width, height } = outputSize(quad);
    const { track, release } = createTracker();

    try {
        const src = track(cv.imread(image));
        const srcPts = track(cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y])));
        const dstPts = track(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]));
        const matrix = track(cv.getPerspectiveTransform(srcPts, dstPts));
        const warped = track(new cv.Mat());
        cv.warpPerspective(src, warped, matrix, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE);

        const out = track(new cv.Mat());
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

        const canvas = document.createElement('canvas');
        cv.imshow(canvas, out);
        return canvas;
    } finally {
        release();
    }
}
