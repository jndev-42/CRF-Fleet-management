export interface Point {
    x: number;
    y: number;
}

/** Quadrilatère ordonné : haut-gauche, haut-droit, bas-droit, bas-gauche. */
export type Quad = [Point, Point, Point, Point];

export const MAX_OUTPUT_DIMENSION = 2000;
/** Tolérance de stabilité (fraction de la diagonale), adaptée à la prise à main levée. */
export const STABLE_TOLERANCE = 0.03;

export function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ordonne 4 points : HG (x+y min), HD (y-x min), BD (x+y max), BG (y-x max). */
export function orderCorners(points: Point[]): Quad {
    if (points.length !== 4) {
        throw new Error('orderCorners attend exactement 4 points');
    }
    const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const byDiff = [...points].sort((a, b) => (a.y - a.x) - (b.y - b.x));
    return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
}

/** Aire d'un polygone (formule du lacet). */
export function polygonArea(points: Point[]): number {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const q = points[(i + 1) % points.length];
        sum += p.x * q.y - q.x * p.y;
    }
    return Math.abs(sum) / 2;
}

export function quadArea(quad: Quad): number {
    return polygonArea(quad);
}

/** Vrai si les 4 sommets, pris dans l'ordre, tournent toujours dans le même sens. */
export function isConvexQuad(points: Point[]): boolean {
    if (points.length !== 4) return false;
    let sign = 0;
    for (let i = 0; i < 4; i++) {
        const a = points[i];
        const b = points[(i + 1) % 4];
        const c = points[(i + 2) % 4];
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        if (cross === 0) return false;
        const s = Math.sign(cross);
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
    }
    return true;
}

/** Quadrilatère couvrant tout le cadre (repli quand aucun bord n'est détecté). */
export function fullFrameQuad(width: number, height: number): Quad {
    return [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
    ];
}

export function scaleQuad(quad: Quad, factor: number): Quad {
    return quad.map((p) => ({ x: p.x * factor, y: p.y * factor })) as Quad;
}

type Vec3 = [number, number, number];

const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const MIN_ASPECT = 0.2;
const MAX_ASPECT = 5;
// Plage plausible de la focale, en multiples de la plus grande dimension de l'image
const MIN_FOCAL_RATIO = 0.25;
const MAX_FOCAL_RATIO = 4;
/** Focale typique d'un téléphone (≈ 0,78 × la plus grande dimension), si elle ne peut pas être estimée. */
const ASSUMED_FOCAL_RATIO = 0.78;
/** En deçà, deux bords opposés sont considérés comme parallèles dans l'image. */
const PARALLEL_EPSILON = 1e-4;

/**
 * Rapport largeur/hauteur réel d'un rectangle vu en perspective (Zhang & He, « Whiteboard scanning
 * and image enhancement », 2003). Le point principal est supposé au centre de l'image.
 * Retourne null si la vue est quasi frontale (focale indéterminée) ou si le résultat est aberrant.
 */
export function estimateAspectRatio(quad: Quad, frameWidth: number, frameHeight: number): number | null {
    const cx = frameWidth / 2;
    const cy = frameHeight / 2;
    const toHomogeneous = (p: Point): Vec3 => [p.x - cx, p.y - cy, 1];
    const [tl, tr, br, bl] = quad;
    const m1 = toHomogeneous(tl);
    const m2 = toHomogeneous(tr);
    const m3 = toHomogeneous(bl);
    const m4 = toHomogeneous(br);

    const m1xm4 = cross(m1, m4);
    const denom2 = dot(cross(m2, m4), m3);
    const denom3 = dot(cross(m3, m4), m2);
    if (denom2 === 0 || denom3 === 0) return null;
    const k2 = dot(m1xm4, m3) / denom2;
    const k3 = dot(m1xm4, m2) / denom3;

    const n2: Vec3 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
    const n3: Vec3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];

    if (![...n2, ...n3].every(Number.isFinite)) return null;

    const largest = Math.max(frameWidth, frameHeight);
    const n2Parallel = Math.abs(n2[2]) < PARALLEL_EPSILON;
    const n3Parallel = Math.abs(n3[2]) < PARALLEL_EPSILON;
    let f2: number;
    if (n2Parallel && n3Parallel) {
        return null; // vue frontale : aucune information de perspective
    } else if (n2Parallel || n3Parallel) {
        // Un seul couple de bords est parallèle (téléphone incliné dans un seul sens) : la focale
        // ne peut pas être estimée, on prend celle, typique, d'un téléphone.
        f2 = (largest * ASSUMED_FOCAL_RATIO) ** 2;
    } else {
        f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
        if (!Number.isFinite(f2) || f2 <= 0) return null;
        const focal = Math.sqrt(f2);
        if (focal < largest * MIN_FOCAL_RATIO || focal > largest * MAX_FOCAL_RATIO) return null;
    }

    const wSquared = (n2[0] ** 2 + n2[1] ** 2) / f2 + n2[2] ** 2;
    const hSquared = (n3[0] ** 2 + n3[1] ** 2) / f2 + n3[2] ** 2;
    const ratio = Math.sqrt(wSquared / hSquared);
    if (!Number.isFinite(ratio) || ratio < MIN_ASPECT || ratio > MAX_ASPECT) return null;
    return ratio;
}

const A4_PORTRAIT = 1 / Math.SQRT2;
const A4_LANDSCAPE = Math.SQRT2;
const A4_SNAP_TOLERANCE = 0.1;

/** Aimante le rapport sur celui d'une feuille A4 (portrait ou paysage) s'il en est proche. */
export function snapToA4(ratio: number): number {
    for (const a4 of [A4_PORTRAIT, A4_LANDSCAPE]) {
        if (Math.abs(ratio / a4 - 1) < A4_SNAP_TOLERANCE) return a4;
    }
    return ratio;
}

/**
 * Taille de l'image redressée : rapport estimé par la perspective (repli : rapport des bords vus),
 * aimanté sur l'A4, largeur = plus grand bord haut/bas, le tout plafonné en gardant le rapport.
 */
export function outputSize(
    quad: Quad,
    frameWidth: number,
    frameHeight: number,
    maxDimension = MAX_OUTPUT_DIMENSION,
): { width: number; height: number } {
    const [tl, tr, br, bl] = quad;
    const edgeWidth = Math.max(1, distance(tl, tr), distance(bl, br));
    const edgeHeight = Math.max(1, distance(tl, bl), distance(tr, br));
    const ratio = snapToA4(estimateAspectRatio(quad, frameWidth, frameHeight) ?? edgeWidth / edgeHeight);

    let width = edgeWidth;
    let height = width / ratio;
    const largest = Math.max(width, height);
    if (largest > maxDimension) {
        const shrink = maxDimension / largest;
        width *= shrink;
        height *= shrink;
    }
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/** Interpolation coin par coin : `alpha` = poids de `next` (moyenne mobile exponentielle). */
export function blendQuads(previous: Quad, next: Quad, alpha: number): Quad {
    return previous.map((p, i) => ({
        x: p.x + (next[i].x - p.x) * alpha,
        y: p.y + (next[i].y - p.y) * alpha,
    })) as Quad;
}

/**
 * Deux détections successives sont stables si chaque coin a bougé de moins de
 * `tolerance` fois la diagonale du cadre.
 */
export function isStable(
    previous: Quad | null,
    next: Quad | null,
    frameWidth: number,
    frameHeight: number,
    tolerance = STABLE_TOLERANCE,
): boolean {
    if (!previous || !next) return false;
    const limit = Math.hypot(frameWidth, frameHeight) * tolerance;
    return previous.every((p, i) => distance(p, next[i]) <= limit);
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
