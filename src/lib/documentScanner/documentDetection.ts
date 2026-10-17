import type { Point, Quad } from './geometry';
import { isConvexQuad, orderCorners, polygonArea } from './geometry';
import { createTracker } from './matTracker';
import { quadsFromSegments, type Segment } from './lineQuads';
import { QuadScorer, isPlausible, type QuadScore } from './quadScoring';
import type { Mat, OpenCv } from './opencv';

type MatVector = InstanceType<OpenCv['MatVector']>;

/** Taille d'analyse de référence : les noyaux morphologiques sont définis pour cette dimension. */
const REFERENCE_SIZE = 480;
const MIN_AREA_RATIO = 0.15;
const MAX_AREA_RATIO = 0.98;
const CLOSE_KERNEL_SIZE = 9;
const OPEN_PAPER_KERNEL_SIZE = 5;
const CLOSE_PAPER_KERNEL_SIZE = 15;
const FAT_EDGE_KERNEL_SIZE = 7;
/** Approximations de l'enveloppe convexe cherchant exactement 4 sommets. */
const EXACT_EPSILONS = [0.02, 0.03, 0.04, 0.05];
/** Approximations la ramenant à quelques sommets, dont on garde le quadrilatère d'aire maximale. */
const REDUCE_EPSILONS = [0.008, 0.012, 0.018, 0.025, 0.035];
const MAX_REDUCE_VERTICES = 12;
const EDGE_CONTOURS = 10;
const PAPER_CONTOURS = 4;
const OTSU_CONTOURS = 3;
const MAX_SEGMENTS = 300;
const HOUGH_THRESHOLD = 30;
const MAX_GRADIENT = 2040; // 255 × (1+2+1) × 2 : borne de la norme L1 de Sobel 3×3
/**
 * Percentile du gradient (pixels non plats) qui sert de référence : le bas de la distribution, c'est-à-dire le
 * niveau de bruit. La médiane, tirée vers le haut par les contours forts d'un formulaire chargé, rendait les
 * seuils trop hauts pour un bord de papier peu contrasté.
 */
const GRADIENT_PERCENTILE = 0.25;
const CANNY_LOW_MIN = 20;
const CANNY_LOW_MAX = 60;
const CANNY_HIGH_MAX = 160;
/** Écart minimal de niveaux de gris entre fond et feuille pour accepter un seuillage Otsu. */
const MIN_OTSU_SEPARATION = 40;
/** Avec un contour de référence : candidats de score ≥ 90 % du meilleur et d'aire ≥ 80 % de la sienne. */
const REFERENCE_SCORE_RATIO = 0.9;
const REFERENCE_AREA_RATIO = 0.8;
/** Deux candidats sont des objets distincts si leurs centres sont écartés d'au moins cette part de √aire. */
const DISTINCT_OBJECT_DISTANCE = 0.3;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const scaledKernel = (base: number, rgba: Mat) => Math.round((base * Math.max(rgba.cols, rgba.rows)) / REFERENCE_SIZE) | 1;

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
            if (seen >= count * GRADIENT_PERCENTILE) {
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

function percentile(histogram: number[], total: number, fraction: number): number {
    let seen = 0;
    for (let level = 0; level < histogram.length; level++) {
        seen += histogram[level];
        if (seen >= total * fraction) return level;
    }
    return histogram.length - 1;
}

/**
 * Masque « papier » : pixels clairs (V près du haut de l'image) et peu saturés. Les seuils sont relatifs
 * à la photo (percentile élevé de V moins une marge ; saturation du papier + marge), pas absolus.
 */
function paperMask(rgba: Uint8Array | Uint8ClampedArray, pixels: number): Uint8Array {
    const value = new Uint8Array(pixels);
    const saturation = new Uint8Array(pixels);
    const valueHistogram = new Array<number>(256).fill(0);
    for (let i = 0; i < pixels; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];
        const max = Math.max(r, g, b);
        value[i] = max;
        saturation[i] = max ? Math.round(((max - Math.min(r, g, b)) * 255) / max) : 0;
        valueHistogram[max]++;
    }
    const valueThreshold = Math.max(percentile(valueHistogram, pixels, 0.9) - 45, 60);

    const saturationHistogram = new Array<number>(256).fill(0);
    let bright = 0;
    for (let i = 0; i < pixels; i++) {
        if (value[i] >= valueThreshold) {
            saturationHistogram[saturation[i]]++;
            bright++;
        }
    }
    const saturationThreshold = clamp(1.6 * percentile(saturationHistogram, bright, 0.5) + 15, 35, 110);

    const mask = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) {
        mask[i] = value[i] >= valueThreshold && saturation[i] <= saturationThreshold ? 255 : 0;
    }
    return mask;
}

/** Points d'une Mat de contour / polygone (CV_32SC2). */
function pointsOf(mat: Mat): Point[] {
    const data = mat.data32S;
    const points: Point[] = [];
    for (let i = 0; i < mat.rows; i++) points.push({ x: data[i * 2], y: data[i * 2 + 1] });
    return points;
}

/** Les 4 sommets d'aire maximale parmi ceux d'un polygone convexe (ordre cyclique conservé). */
function largestInscribedQuad(points: Point[]): Point[] {
    const n = points.length;
    let best: Point[] = points.slice(0, 4);
    let bestArea = -1;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            for (let k = j + 1; k < n; k++) {
                for (let l = k + 1; l < n; l++) {
                    const quad = [points[i], points[j], points[k], points[l]];
                    const area = polygonArea(quad);
                    if (area > bestArea) {
                        bestArea = area;
                        best = quad;
                    }
                }
            }
        }
    }
    return best;
}

/**
 * Quadrilatères tirés de l'enveloppe convexe d'un contour : approximation à exactement 4 sommets si possible,
 * sinon réduction à ≤ 12 sommets puis choix des 4 qui délimitent la plus grande aire (au lieu d'abandonner).
 */
function quadsFromHull(cv: OpenCv, hull: Mat): Point[][] {
    const perimeter = cv.arcLength(hull, true);
    const quads: Point[][] = [];
    for (const epsilon of EXACT_EPSILONS) {
        const approx = new cv.Mat();
        try {
            cv.approxPolyDP(hull, approx, epsilon * perimeter, true);
            if (approx.rows === 4) {
                quads.push(pointsOf(approx));
                return quads;
            }
        } finally {
            approx.delete();
        }
    }
    for (const epsilon of REDUCE_EPSILONS) {
        const approx = new cv.Mat();
        try {
            cv.approxPolyDP(hull, approx, epsilon * perimeter, true);
            if (approx.rows > 4 && approx.rows <= MAX_REDUCE_VERTICES) {
                quads.push(largestInscribedQuad(pointsOf(approx)));
                return quads;
            }
        } finally {
            approx.delete();
        }
    }
    return quads;
}

/** Candidats issus des plus grands contours externes d'une image binaire. */
function quadsFromBinary(cv: OpenCv, binary: Mat, frameArea: number, limit: number, nested = false): Point[][] {
    const { track, release } = createTracker();
    const hulls: Array<{ hull: Mat; area: number }> = [];
    try {
        const contours: MatVector = track(new cv.MatVector());
        const hierarchy = track(new cv.Mat());
        // `nested` : tous les contours, y compris ceux enfermés dans un autre (une feuille posée sur un sous-main
        // dessine une boucle de bords à l'intérieur de celle du sous-main, que RETR_EXTERNAL ne verrait jamais)
        cv.findContours(binary, contours, hierarchy, nested ? cv.RETR_LIST : cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            try {
                if (contour.rows < 4) continue;
                // Suivi dès la création : si convexHull ou contourArea lève, la Mat est quand même libérée
                const item = { hull: new cv.Mat(), area: 0 };
                hulls.push(item);
                cv.convexHull(contour, item.hull, false, true);
                item.area = cv.contourArea(item.hull);
            } finally {
                contour.delete();
            }
        }
        hulls.sort((a, b) => b.area - a.area);
        const quads: Point[][] = [];
        for (const { hull, area } of hulls.slice(0, limit)) {
            if (area >= frameArea * MIN_AREA_RATIO) quads.push(...quadsFromHull(cv, hull));
        }
        return quads;
    } finally {
        hulls.forEach(({ hull }) => hull.delete());
        release();
    }
}

/** Candidats formés par l'intersection des droites les plus fortes (bord faible, coin masqué, vue oblique). */
function quadsFromLines(cv: OpenCv, edgesThin: Mat): Point[][] {
    const { track, release } = createTracker();
    try {
        const size = Math.max(edgesThin.cols, edgesThin.rows);
        const lines = track(new cv.Mat());
        cv.HoughLinesP(edgesThin, lines, 1, Math.PI / 180, HOUGH_THRESHOLD, 0.12 * size, 0.03 * size);
        const data = lines.data32S;
        const segments: Segment[] = [];
        for (let i = 0; i < lines.rows; i++) {
            segments.push({ x1: data[i * 4], y1: data[i * 4 + 1], x2: data[i * 4 + 2], y2: data[i * 4 + 3] });
        }
        segments.sort((a, b) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1) - Math.hypot(a.x2 - a.x1, a.y2 - a.y1));
        return quadsFromSegments(segments.slice(0, MAX_SEGMENTS), edgesThin.cols, edgesThin.rows);
    } finally {
        release();
    }
}

/** Quadrilatère ordonné, convexe, borné au cadre, d'aire plausible — ou null. */
function validQuad(points: Point[], width: number, height: number): Quad | null {
    if (points.length !== 4) return null;
    const ordered = orderCorners(points);
    if (!isConvexQuad(ordered)) return null;
    const clamped = ordered.map((p) => ({ x: clamp(p.x, 0, width), y: clamp(p.y, 0, height) })) as Quad;
    const area = polygonArea(clamped);
    const frameArea = width * height;
    if (area < frameArea * MIN_AREA_RATIO || area > frameArea * MAX_AREA_RATIO) return null;
    return clamped;
}

function centroid(quad: Quad): { x: number; y: number } {
    return { x: quad.reduce((s, p) => s + p.x, 0) / 4, y: quad.reduce((s, p) => s + p.y, 0) / 4 };
}

function meanCornerDistance(a: Quad, b: Quad): number {
    return a.reduce((sum, p, i) => sum + Math.hypot(p.x - b[i].x, p.y - b[i].y), 0) / 4;
}

export interface Scored {
    quad: Quad;
    score: QuadScore;
}

/** Un candidat emboîté doit faire au moins cette part de l'aire du gagnant, et au plus `NESTED_MAX_AREA_RATIO` (écarte les doublons). */
const NESTED_MIN_AREA_RATIO = 0.25;
const NESTED_MAX_AREA_RATIO = 0.9;
const NESTED_MIN_EDGE_SIDE = 0.5;
/** Chaque côté doit contraster dans le même sens : écarte un « quadrilatère » mêlant bords de feuille et bords d'un bloc intérieur. */
const NESTED_MIN_CONTRAST_SIDE = 0.25;
const NESTED_MIN_SCORE_RATIO = 0.85;
const NESTED_MAX_DEPTH = 4;
/**
 * Densité de bords (par unité de périmètre de l'intérieur) dans l'anneau entre un quadrilatère et celui qu'il contient.
 * Propre (< seuil) : l'intérieur est posé sur un support uniforme (feuille sur sous-main) ; sale : il y a du contenu
 * entre les deux (en-tête, tableau) et l'intérieur n'est qu'une partie de l'extérieur.
 */
const RING_DIRTY_DENSITY = 0.1;

/** Point à l'intérieur (ou à moins de `slack` px) d'un quadrilatère convexe ordonné dans le sens horaire (y vers le bas). */
function insideConvex(quad: Quad, p: { x: number; y: number }, slack: number): boolean {
    for (let i = 0; i < 4; i++) {
        const a = quad[i];
        const b = quad[(i + 1) % 4];
        const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if (cross < -slack * Math.hypot(b.x - a.x, b.y - a.y)) return false;
    }
    return true;
}

/** Nombre de côtés de `inner` dont les deux extrémités sont à moins de `slack` px de la droite du côté correspondant de `outer`. */
function sharedSideCount(outer: Quad, inner: Quad, slack: number): number {
    let shared = 0;
    for (let i = 0; i < 4; i++) {
        const a = outer[i];
        const b = outer[(i + 1) % 4];
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const offLine = (p: { x: number; y: number }) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / length;
        if (offLine(inner[i]) <= slack && offLine(inner[(i + 1) % 4]) <= slack) shared++;
    }
    return shared;
}

/** `inner` est-il emboîté dans `outer` (coins dedans, aire entre 25 % et 90 %) et assez solide pour rivaliser avec `current` ? */
function isStrongNested(outer: Scored, inner: Scored, rival: Scored): boolean {
    const outerArea = polygonArea(outer.quad);
    const innerArea = polygonArea(inner.quad);
    const slack = 0.03 * Math.sqrt(outerArea);
    return (
        innerArea >= outerArea * NESTED_MIN_AREA_RATIO
        && innerArea <= outerArea * NESTED_MAX_AREA_RATIO
        && inner.quad.every((p) => insideConvex(outer.quad, p, slack))
        && rival.score.edgeMin >= NESTED_MIN_EDGE_SIDE
        && rival.score.contrastMin >= NESTED_MIN_CONTRAST_SIDE
        && rival.score.total >= (rival === outer ? inner : outer).score.total * NESTED_MIN_SCORE_RATIO
    );
}

/**
 * Règle d'emboîtement, qui tranche selon ce qu'il y a entre deux candidats emboîtés (anneau) :
 * - anneau propre (support uniforme) : l'intérieur est le document posé sur un set / un sous-main → on garde l'intérieur ;
 * - anneau sale (en-tête, tableau…) : l'intérieur n'est qu'une partie du document → on remonte à l'extérieur.
 * Un formulaire chargé peut en effet mieux scorer par l'un de ses sous-rectangles, ou moins bien que son support.
 */
function resolveNesting(winner: Scored, scored: Scored[], ringDensity: RingDensity): Scored {
    let current = winner;
    for (let depth = 0; depth < NESTED_MAX_DEPTH; depth++) {
        // Remontée : `current` n'est qu'une partie de `s` seulement s'il en partage au moins 3 côtés (le 4e est
        // rentré : en-tête, bandeau) et que du contenu occupe l'anneau ; un quadrilatère à peine plus grand dont
        // aucun côté n'est commun (bruit du fond) n'est pas un « parent ».
        const enclosing = scored.filter(
            (s) =>
                s !== current
                && isStrongNested(s, current, s)
                && sharedSideCount(s.quad, current.quad, 0.03 * Math.sqrt(polygonArea(s.quad))) >= 3
                && ringDensity(s.quad, current.quad) >= RING_DIRTY_DENSITY,
        );
        if (enclosing.length) {
            current = enclosing.reduce((a, b) => (b.score.total > a.score.total ? b : a));
            continue;
        }
        const inside = scored.filter(
            (s) => s !== current && isStrongNested(current, s, s) && ringDensity(current.quad, s.quad) < RING_DIRTY_DENSITY,
        );
        if (!inside.length) break;
        current = inside.reduce((a, b) => (b.score.total > a.score.total ? b : a));
    }
    return current;
}

/** Densité de bords de l'anneau entre deux quadrilatères emboîtés (voir `QuadScorer.ringEdgeDensity`). */
export type RingDensity = (outer: Quad, inner: Quad) => number;

/**
 * Meilleur candidat par score, ajusté par la règle d'emboîtement ; avec un contour de référence (le contour
 * suivi), celui-ci départage seulement les candidats de score et d'aire proches du meilleur, dans les deux
 * sens (ni nettement plus petits, ni nettement plus grands) — jamais une priorité, sinon le suivi resterait
 * verrouillé sur un bloc de texte ou sur le set qui entoure la feuille.
 */
export function pickBest(scored: Scored[], reference: Quad | null, ringDensity: RingDensity = () => 0): Quad | null {
    if (!scored.length) return null;
    const best = resolveNesting(scored.reduce((a, b) => (b.score.total > a.score.total ? b : a)), scored, ringDensity);
    if (!reference) return best.quad;
    const bestArea = polygonArea(best.quad);
    const bestCenter = centroid(best.quad);
    // Le meilleur, plus les autres OBJETS comparables (centre nettement ailleurs). Les variantes du même objet
    // (quadrilatères qui en partagent trois côtés, à peine décalés) n'en font pas partie : la référence ne doit
    // pas faire préférer l'une d'elles au meilleur.
    const pool = scored.filter((s) => {
        if (s === best) return true;
        const area = polygonArea(s.quad);
        const center = centroid(s.quad);
        return (
            s.score.total >= best.score.total * REFERENCE_SCORE_RATIO
            && area >= bestArea * REFERENCE_AREA_RATIO
            && area <= bestArea / REFERENCE_AREA_RATIO
            && Math.hypot(center.x - bestCenter.x, center.y - bestCenter.y) >= DISTINCT_OBJECT_DISTANCE * Math.sqrt(bestArea)
        );
    });
    return pool.reduce((a, b) => (meanCornerDistance(b.quad, reference) < meanCornerDistance(a.quad, reference) ? b : a)).quad;
}

/**
 * Cœur de la détection (pur OpenCV, sans DOM) : quadrilatère du document dans une image RGBA, coins
 * ordonnés, en coordonnées de cette image — ou null.
 *
 * Plusieurs générateurs de candidats, tous à la résolution d'analyse :
 * contours de Canny (après fermeture morphologique qui efface le texte), masque « papier » (clair, peu
 * saturé), intersections de droites (Hough) et seuillage d'Otsu. Chaque candidat convexe d'au moins 15 % du
 * cadre est noté (support de bord sur les 4 côtés, papier dedans, contraste dedans/dehors, intérieur sans
 * bords, forme, aire) : un rectangle plus grand qui contient la feuille (set, table) perd.
 *
 * `reference` (le contour déjà suivi, en coordonnées de cette image) ne sert qu'à départager des candidats proches.
 */
export function findDocumentQuad(cv: OpenCv, rgba: Mat, reference: Quad | null = null): Quad | null {
    const width = rgba.cols;
    const height = rgba.rows;
    const frameArea = width * height;
    if (!frameArea) return null;

    const { track, release } = createTracker();
    try {
        const gray = track(new cv.Mat());
        cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
        const closeSize = scaledKernel(CLOSE_KERNEL_SIZE, rgba);
        const closeKernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(closeSize, closeSize)));
        const closed = track(new cv.Mat());
        cv.morphologyEx(gray, closed, cv.MORPH_CLOSE, closeKernel);
        const blurred = track(new cv.Mat());
        cv.GaussianBlur(closed, blurred, new cv.Size(5, 5), 0);

        // Cartes de bords : fine (notation, Hough), dilatée 3×3 (contours), dilatée 7×7 (tolérance du support)
        const { low, high } = cannyThresholds(cv, blurred);
        const edgesThin = track(new cv.Mat());
        cv.Canny(blurred, edgesThin, low, high);
        const edgesDilated = track(new cv.Mat());
        cv.dilate(edgesThin, edgesDilated, track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))));
        const edgesFat = track(new cv.Mat());
        const fatSize = scaledKernel(FAT_EDGE_KERNEL_SIZE, rgba);
        cv.dilate(edgesThin, edgesFat, track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(fatSize, fatSize))));

        // Masque « papier », nettoyé : ouverture (retire les poussières) puis fermeture (efface le texte)
        const paper = track(new cv.Mat(height, width, cv.CV_8UC1));
        paper.data.set(paperMask(rgba.data, frameArea));
        const openSize = scaledKernel(OPEN_PAPER_KERNEL_SIZE, rgba);
        cv.morphologyEx(paper, paper, cv.MORPH_OPEN, track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(openSize, openSize))));
        const paperCloseSize = scaledKernel(CLOSE_PAPER_KERNEL_SIZE, rgba);
        cv.morphologyEx(paper, paper, cv.MORPH_CLOSE, track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(paperCloseSize, paperCloseSize))));

        const candidates: Point[][] = [
            ...quadsFromBinary(cv, edgesDilated, frameArea, EDGE_CONTOURS, true),
            ...quadsFromBinary(cv, paper, frameArea, PAPER_CONTOURS),
            ...quadsFromLines(cv, edgesThin),
        ];

        // Seuillage d'Otsu, seulement si fond et feuille sont nettement séparés
        const binary = track(new cv.Mat());
        const threshold = cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        if (classSeparation(blurred.data, threshold) >= MIN_OTSU_SEPARATION) {
            candidates.push(...quadsFromBinary(cv, binary, frameArea, OTSU_CONTOURS));
        }

        const scorer = new QuadScorer({
            width,
            height,
            gray: blurred.data,
            edgesThin: edgesThin.data,
            edgesFat: edgesFat.data,
            paper: paper.data,
        });
        const scored: Scored[] = [];
        for (const points of candidates) {
            const quad = validQuad(points, width, height);
            if (!quad) continue;
            const score = scorer.score(quad);
            if (isPlausible(score)) scored.push({ quad, score });
        }
        return pickBest(scored, reference, (outer, inner) => scorer.ringEdgeDensity(outer, inner));
    } finally {
        release();
    }
}
