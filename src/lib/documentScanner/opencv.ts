import type { Point, Quad } from './geometry';
import { isConvexQuad, orderCorners, outputSize, polygonArea, scaleQuad } from './geometry';

// Seuls les types sont importés ici : le moteur (~9 Mo) n'est chargé qu'à l'appel de loadOpenCv().
export type OpenCv = typeof import('@techstark/opencv-js');
type Mat = InstanceType<OpenCv['Mat']>;
type MatVector = InstanceType<OpenCv['MatVector']>;

/** `original` : redressement seul, sans normalisation ni seuillage ; `color` : contraste amélioré ; `bw` : noir & blanc. */
export type EnhanceMode = 'original' | 'color' | 'bw';

/** Taille d'analyse (plus grande dimension) : légère en direct, plus fine à la capture. */
export const LIVE_ANALYSIS_SIZE = 480;
export const CAPTURE_ANALYSIS_SIZE = 1000;

const MIN_AREA_RATIO = 0.15;
const MAX_AREA_RATIO = 0.98;
/** Le contour doit remplir au moins cette part du quadrilatère retenu (écarte les blobs déchiquetés). */
const MIN_FILL_RATIO = 0.6;
const APPROX_EPSILONS = [0.02, 0.03, 0.04, 0.05];
const MAX_CANDIDATE_CONTOURS = 8;
/** Avec un contour de référence, seuls les candidats d'au moins cette part du plus grand sont départagés par proximité. */
const REFERENCE_SIZE_RATIO = 0.8;
const CLOSE_KERNEL_SIZE = 9; // à LIVE_ANALYSIS_SIZE ; proportionnel ensuite
const MAX_GRADIENT = 2040; // 255 × (1+2+1) × 2 : borne de la norme L1 de Sobel 3×3
const CANNY_LOW_MIN = 20;
const CANNY_LOW_MAX = 60;
const CANNY_HIGH_MAX = 160;
/** Écart minimal de niveaux de gris entre fond et feuille pour accepter un seuillage Otsu. */
const MIN_OTSU_SEPARATION = 40;

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

/** Approxime un contour par un quadrilatère convexe, en élargissant epsilon jusqu'à obtenir 4 sommets. */
function approximateQuad(cv: OpenCv, contour: Mat, contourArea: number, frameArea: number): Point[] | null {
    const perimeter = cv.arcLength(contour, true);
    for (const epsilon of APPROX_EPSILONS) {
        const approx = new cv.Mat();
        try {
            cv.approxPolyDP(contour, approx, epsilon * perimeter, true);
            if (approx.rows !== 4) continue;
            const pts: Point[] = [];
            for (let k = 0; k < 4; k++) {
                pts.push({ x: approx.intPtr(k, 0)[0], y: approx.intPtr(k, 0)[1] });
            }
            const area = polygonArea(pts);
            if (
                area >= frameArea * MIN_AREA_RATIO
                && area <= frameArea * MAX_AREA_RATIO
                && contourArea >= area * MIN_FILL_RATIO
                && isConvexQuad(pts)
            ) {
                return pts;
            }
        } finally {
            approx.delete();
        }
    }
    return null;
}

/**
 * Plus grand contour externe assimilable à un quadrilatère (directement, sinon via son enveloppe convexe).
 * Le classement et le taux de remplissage reposent sur l'aire de l'enveloppe convexe : une bordure
 * ouverte (doigt, ombre) a une aire propre quasi nulle mais son enveloppe retrouve le document.
 */
function quadFromContours(cv: OpenCv, contours: MatVector, frameArea: number, reference: Quad | null): Point[] | null {
    const candidates: Array<{ index: number; hullArea: number }> = [];
    for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const hull = new cv.Mat();
        try {
            cv.convexHull(contour, hull, false, true);
            const hullArea = cv.contourArea(hull);
            if (hullArea >= frameArea * MIN_AREA_RATIO) candidates.push({ index: i, hullArea });
        } finally {
            hull.delete();
            contour.delete();
        }
    }
    candidates.sort((a, b) => b.hullArea - a.hullArea);

    // Sans référence : le plus grand candidat valide. Avec le contour suivi : il ne départage que des
    // candidats de taille comparable (≥ 80 % du plus grand), pour éviter de sauter entre deux feuilles
    // voisines ; un candidat nettement plus petit (bloc de texte, case) ne peut jamais l'emporter sur
    // la feuille entière, sans quoi le suivi resterait verrouillé dessus.
    let largest: { pts: Point[]; hullArea: number } | null = null;
    let best: { pts: Point[]; distance: number } | null = null;
    for (const { index, hullArea } of candidates.slice(0, MAX_CANDIDATE_CONTOURS)) {
        const contour = contours.get(index);
        const hull = new cv.Mat();
        try {
            let pts = approximateQuad(cv, contour, hullArea, frameArea);
            if (!pts) {
                cv.convexHull(contour, hull, false, true);
                pts = approximateQuad(cv, hull, hullArea, frameArea);
            }
            if (!pts) continue;
            if (!reference) return pts;
            // Les candidats sont triés par aire décroissante : le premier valide est le plus grand
            largest ??= { pts, hullArea };
            if (hullArea < largest.hullArea * REFERENCE_SIZE_RATIO) continue;
            const gap = meanCornerDistance(orderCorners(pts), reference);
            if (!best || gap < best.distance) best = { pts, distance: gap };
        } finally {
            hull.delete();
            contour.delete();
        }
    }
    return best ? best.pts : null;
}

function meanCornerDistance(a: Quad, b: Quad): number {
    return a.reduce((sum, p, i) => sum + Math.hypot(p.x - b[i].x, p.y - b[i].y), 0) / 4;
}

function findQuadInBinary(cv: OpenCv, binary: Mat, frameArea: number, reference: Quad | null): Point[] | null {
    const { track, release } = createTracker();
    try {
        const contours = track(new cv.MatVector());
        const hierarchy = track(new cv.Mat());
        cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        return quadFromContours(cv, contours, frameArea, reference);
    } finally {
        release();
    }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Seuils de Canny dérivés de la médiane du gradient (et non du niveau de gris : une feuille blanche
 * plein cadre donnerait des seuils inatteignables pour un bord papier sur bureau clair).
 * Le gradient est la norme L1 |gx| + |gy| de Sobel 3×3, comme dans Canny ; seuls les pixels non plats comptent.
 */
function cannyThresholds(cv: OpenCv, blurred: Mat): { low: number; high: number } {
    const { track, release } = createTracker();
    try {
        const gx = track(new cv.Mat());
        const gy = track(new cv.Mat());
        cv.Sobel(blurred, gx, cv.CV_32F, 1, 0, 3);
        cv.Sobel(blurred, gy, cv.CV_32F, 0, 1, 3);
        const dx = gx.data32F;
        const dy = gy.data32F;
        const histogram = new Array<number>(MAX_GRADIENT + 1).fill(0);
        let count = 0;
        for (let i = 0; i < dx.length; i++) {
            const magnitude = Math.min(MAX_GRADIENT, Math.round(Math.abs(dx[i]) + Math.abs(dy[i])));
            if (magnitude < 1) continue;
            histogram[magnitude]++;
            count++;
        }
        let median = 0;
        let seen = 0;
        for (let level = 1; level <= MAX_GRADIENT && count; level++) {
            seen += histogram[level];
            if (seen >= count / 2) {
                median = level;
                break;
            }
        }
        const low = clamp(0.66 * median, CANNY_LOW_MIN, CANNY_LOW_MAX);
        const high = clamp(1.33 * median, 2 * low, CANNY_HIGH_MAX);
        return { low, high };
    } finally {
        release();
    }
}

/** Écart entre la moyenne des pixels clairs et celle des pixels sombres autour d'un seuil. */
function classSeparation(data: Uint8Array, threshold: number): number {
    let darkSum = 0;
    let darkCount = 0;
    let lightSum = 0;
    let lightCount = 0;
    for (let i = 0; i < data.length; i++) {
        if (data[i] > threshold) {
            lightSum += data[i];
            lightCount++;
        } else {
            darkSum += data[i];
            darkCount++;
        }
    }
    if (!darkCount || !lightCount) return 0;
    return lightSum / lightCount - darkSum / darkCount;
}

/**
 * Cœur de la détection (pur OpenCV, sans DOM) : plus grand quadrilatère convexe plausible
 * dans une image RGBA, coins ordonnés, en coordonnées de cette image — ou null.
 *
 * gris → fermeture morphologique (efface le texte) → flou → Canny à seuils automatiques →
 * contours externes ; à défaut, seuillage Otsu (feuille claire sur fond plus sombre).
 *
 * `reference` (le contour déjà suivi, en coordonnées de cette image) : parmi les candidats valides,
 * on préfère le plus proche de lui plutôt que le plus grand.
 */
export function findDocumentQuad(cv: OpenCv, rgba: Mat, reference: Quad | null = null): Quad | null {
    const frameArea = rgba.cols * rgba.rows;
    if (!frameArea) return null;

    const { track, release } = createTracker();
    try {
        const gray = track(new cv.Mat());
        cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
        // Le noyau suit la définition d'analyse : 9 px à 480 px, proportionnellement au-delà
        const kernelSize = Math.round((CLOSE_KERNEL_SIZE * Math.max(rgba.cols, rgba.rows)) / LIVE_ANALYSIS_SIZE) | 1;
        const closeKernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, kernelSize)));
        const closed = track(new cv.Mat());
        cv.morphologyEx(gray, closed, cv.MORPH_CLOSE, closeKernel);
        const blurred = track(new cv.Mat());
        cv.GaussianBlur(closed, blurred, new cv.Size(5, 5), 0);

        // Essai 1 : contours de Canny, seuils dérivés de la médiane du gradient
        const { low, high } = cannyThresholds(cv, blurred);
        const edges = track(new cv.Mat());
        cv.Canny(blurred, edges, low, high);
        const dilateKernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
        cv.dilate(edges, edges, dilateKernel);
        let found = findQuadInBinary(cv, edges, frameArea, reference);

        // Essai 2 : seuillage d'Otsu, seulement si fond et feuille sont nettement séparés
        if (!found) {
            const binary = track(new cv.Mat());
            const threshold = cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
            if (classSeparation(blurred.data as Uint8Array, threshold) >= MIN_OTSU_SEPARATION) {
                found = findQuadInBinary(cv, binary, frameArea, reference);
            }
        }

        return found ? orderCorners(found) : null;
    } finally {
        release();
    }
}

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
