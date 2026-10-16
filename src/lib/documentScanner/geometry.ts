export interface Point {
    x: number;
    y: number;
}

/** Quadrilatère ordonné : haut-gauche, haut-droit, bas-droit, bas-gauche. */
export type Quad = [Point, Point, Point, Point];

export const MAX_OUTPUT_DIMENSION = 2000;

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

/** Taille de l'image redressée d'après la longueur des bords, plafonnée. */
export function outputSize(quad: Quad, maxDimension = MAX_OUTPUT_DIMENSION): { width: number; height: number } {
    const [tl, tr, br, bl] = quad;
    let width = Math.max(1, distance(tl, tr), distance(bl, br));
    let height = Math.max(1, distance(tl, bl), distance(tr, br));
    const largest = Math.max(width, height);
    if (largest > maxDimension) {
        const ratio = maxDimension / largest;
        width *= ratio;
        height *= ratio;
    }
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
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
    tolerance = 0.02,
): boolean {
    if (!previous || !next) return false;
    const limit = Math.hypot(frameWidth, frameHeight) * tolerance;
    return previous.every((p, i) => distance(p, next[i]) <= limit);
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
