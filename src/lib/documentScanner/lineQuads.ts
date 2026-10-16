import type { Point } from './geometry';

export interface Segment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

interface Line {
    /** Point d'ancrage (milieu du plus long segment du groupe) */
    px: number;
    py: number;
    /** Direction unitaire */
    dx: number;
    dy: number;
    /** Somme des longueurs des segments regroupés */
    strength: number;
}

const BIN_COUNT = 36; // pas de 5° sur [0, π)
const FAMILY_TOLERANCE = (35 * Math.PI) / 180;
const CLUSTER_ANGLE = (10 * Math.PI) / 180;
const CLUSTER_OFFSET = 0.025; // fraction de la diagonale
const MIN_SIDE_SEPARATION = 0.12; // fraction de la diagonale entre deux côtés opposés
const LINES_PER_FAMILY = 6; // assez pour garder les côtés de la feuille malgré les traits d'un formulaire et ceux d'un sous-main
const MAX_REACH = 2; // les coins restent à moins de 2 cadres du centre

/** Écart entre deux angles de droites (modulo π), dans [0, π/2]. */
function angleGap(a: number, b: number): number {
    const d = Math.abs(a - b) % Math.PI;
    return Math.min(d, Math.PI - d);
}

function segmentAngle(s: Segment): number {
    const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    return ((a % Math.PI) + Math.PI) % Math.PI;
}

const segmentLength = (s: Segment) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

/** Angle dominant (pondéré par la longueur), lissé sur les bacs voisins. */
function dominantAngle(segments: Segment[]): number {
    const hist = new Array<number>(BIN_COUNT).fill(0);
    for (const s of segments) {
        const bin = Math.min(BIN_COUNT - 1, Math.floor((segmentAngle(s) / Math.PI) * BIN_COUNT));
        hist[bin] += segmentLength(s);
    }
    let best = 0;
    let bestValue = -1;
    for (let i = 0; i < BIN_COUNT; i++) {
        const smoothed = hist[(i + BIN_COUNT - 1) % BIN_COUNT] + hist[i] + hist[(i + 1) % BIN_COUNT];
        if (smoothed > bestValue) {
            bestValue = smoothed;
            best = i;
        }
    }
    return ((best + 0.5) / BIN_COUNT) * Math.PI;
}

function distanceToLine(line: Line, x: number, y: number): number {
    return Math.abs((x - line.px) * line.dy - (y - line.py) * line.dx);
}

/** Regroupe les segments quasi colinéaires en droites ; garde les plus fortes. */
function clusterLines(segments: Segment[], diagonal: number): Line[] {
    const lines: Array<Line & { angle: number }> = [];
    for (const s of [...segments].sort((a, b) => segmentLength(b) - segmentLength(a))) {
        const length = segmentLength(s);
        const angle = segmentAngle(s);
        const mx = (s.x1 + s.x2) / 2;
        const my = (s.y1 + s.y2) / 2;
        const match = lines.find(
            (l) => angleGap(l.angle, angle) <= CLUSTER_ANGLE && distanceToLine(l, mx, my) <= diagonal * CLUSTER_OFFSET,
        );
        if (match) {
            match.strength += length;
        } else {
            lines.push({ px: mx, py: my, dx: (s.x2 - s.x1) / length, dy: (s.y2 - s.y1) / length, strength: length, angle });
        }
    }
    return lines.sort((a, b) => b.strength - a.strength).slice(0, LINES_PER_FAMILY);
}

function intersect(a: Line, b: Line): Point | null {
    const cross = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(cross) < 1e-6) return null;
    const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / cross;
    return { x: a.px + a.dx * t, y: a.py + a.dy * t };
}

function pairs<T>(items: T[]): Array<[T, T]> {
    const out: Array<[T, T]> = [];
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
    }
    return out;
}

/**
 * Quadrilatères formés par les intersections des droites les plus fortes de deux familles
 * d'orientations (≈ « horizontales » et « verticales » du document). Utile quand un bord est
 * trop faible pour fermer un contour (vue oblique, coin masqué) : les trois autres suffisent à
 * le retrouver. Coins non ordonnés, à valider par l'appelant.
 */
export function quadsFromSegments(segments: Segment[], width: number, height: number): Point[][] {
    const usable = segments.filter((s) => segmentLength(s) > 0);
    if (usable.length < 4) return [];
    const diagonal = Math.hypot(width, height);

    const main = dominantAngle(usable);
    const familyA = usable.filter((s) => angleGap(segmentAngle(s), main) <= FAMILY_TOLERANCE);
    const familyB = usable.filter((s) => angleGap(segmentAngle(s), main + Math.PI / 2) <= FAMILY_TOLERANCE);
    const linesA = clusterLines(familyA, diagonal);
    const linesB = clusterLines(familyB, diagonal);
    if (linesA.length < 2 || linesB.length < 2) return [];

    const apart = ([p, q]: [Line, Line]) => distanceToLine(q, p.px, p.py) >= diagonal * MIN_SIDE_SEPARATION;
    const near = (p: Point) =>
        p.x > -width * (MAX_REACH - 1) && p.x < width * MAX_REACH && p.y > -height * (MAX_REACH - 1) && p.y < height * MAX_REACH;

    const quads: Point[][] = [];
    for (const [a1, a2] of pairs(linesA).filter(apart)) {
        for (const [b1, b2] of pairs(linesB).filter(apart)) {
            const corners = [intersect(a1, b1), intersect(a1, b2), intersect(a2, b2), intersect(a2, b1)];
            if (corners.every((c): c is Point => c !== null && near(c))) quads.push(corners);
        }
    }
    return quads;
}
