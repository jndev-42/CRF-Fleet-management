import { distance, polygonArea, type Point, type Quad } from './geometry';

/** Cartes d'analyse (même résolution, `width × height`, une valeur par pixel). */
export interface ScoringMaps {
    width: number;
    height: number;
    /** Niveaux de gris (image floutée). */
    gray: Uint8Array;
    /** Contours de Canny, 1 px d'épaisseur (≠ 0 = bord). */
    edgesThin: Uint8Array;
    /** Contours de Canny dilatés (tolère un décalage de quelques pixels du côté estimé). */
    edgesFat: Uint8Array;
    /** Masque « papier » : pixels clairs et peu saturés (≠ 0). */
    paper: Uint8Array;
}

/** Détail du score d'un quadrilatère (toutes les composantes valent 0 à 1). */
export interface QuadScore {
    total: number;
    /** Support de bord : 0,6 × côté le plus faible + 0,4 × moyenne. */
    edge: number;
    edgeMean: number;
    edgeMin: number;
    /** Contraste dedans/dehors le long des côtés : 0,6 × côté le plus faible + 0,4 × moyenne. */
    contrast: number;
    /** Contraste du côté le plus faible, dans le sens dominant (0 si un côté change de sens). */
    contrastMin: number;
    /** Part du masque « papier » à l'intérieur. */
    paper: number;
    /** 1 − densité de bords à l'intérieur (une feuille propre n'en contient presque pas ; un set qui entoure la feuille, si). */
    interior: number;
    /** Facteur multiplicatif : angles extrêmes et rapports de côtés absurdes. */
    shape: number;
    area: number;
}

const SAMPLES_PER_SIDE = 40;
const CONTRAST_SAMPLES_PER_SIDE = 24;
const BORDER_MARGIN = 2;
const INNER_OFFSET_RATIO = 0.007; // ≈ 4–5 px à 640 px
const OUTER_OFFSET_RATIO = 0.012; // ≈ 8 px à 640 px
const NEUTRAL = 0.5;
/** Écart de gris (intérieur / extérieur) qui vaut un contraste maximal. */
const FULL_CONTRAST_LEVELS = 64;
/** Densité de bords intérieurs (par unité de périmètre) qui annule le score « intérieur propre ». */
const FULL_INTERIOR_EDGE_DENSITY = 2.0;
const INTERIOR_SHRINK = 0.85;
/** Anneau entre deux quadrilatères emboîtés : on exclut 4 % de chaque côté de leurs propres contours. */
const RING_OUTER_SHRINK = 0.96;
const RING_INNER_GROW = 1.04;
const AREA_BONUS_CAP = 0.6;

const WEIGHTS = { edge: 0.33, interior: 0.22, paper: 0.17, contrast: 0.16, area: 0.12 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Cumul par ligne : prefix[y * (w + 1) + x] = nombre de pixels non nuls de la ligne y dans [0, x). */
function rowPrefix(map: Uint8Array, w: number, h: number): Int32Array {
    const out = new Int32Array(h * (w + 1));
    for (let y = 0; y < h; y++) {
        let acc = 0;
        const base = y * (w + 1);
        for (let x = 0; x < w; x++) {
            out[base + x] = acc;
            if (map[y * w + x]) acc++;
        }
        out[base + w] = acc;
    }
    return out;
}

interface Span {
    y: number;
    xl: number;
    xr: number;
}

/** Intervalle horizontal occupé par un polygone convexe sur chaque ligne de pixels. */
function rowSpans(quad: Quad, height: number): Span[] {
    const ys = quad.map((p) => p.y);
    const y0 = Math.max(0, Math.ceil(Math.min(...ys)));
    const y1 = Math.min(height - 1, Math.floor(Math.max(...ys)));
    const spans: Span[] = [];
    for (let y = y0; y <= y1; y++) {
        const yc = y + 0.5;
        let xl = Infinity;
        let xr = -Infinity;
        for (let i = 0; i < 4; i++) {
            const a = quad[i];
            const b = quad[(i + 1) % 4];
            if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) {
                const x = a.x + ((yc - a.y) / (b.y - a.y)) * (b.x - a.x);
                xl = Math.min(xl, x);
                xr = Math.max(xr, x);
            }
        }
        if (xr >= xl) spans.push({ y, xl, xr });
    }
    return spans;
}

function shrink(quad: Quad, factor: number): Quad {
    const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
    const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
    return quad.map((p) => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor })) as Quad;
}

function angleAt(prev: Point, p: Point, next: Point): number {
    const ax = prev.x - p.x;
    const ay = prev.y - p.y;
    const bx = next.x - p.x;
    const by = next.y - p.y;
    const cos = (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
    return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/** Pénalité d'angle : 1 dans [35°, 145°], décroissante jusqu'à 0 à 15° / 165°. */
function angleFactor(angle: number): number {
    if (angle >= 35 && angle <= 145) return 1;
    return angle < 35 ? clamp01((angle - 15) / 20) : clamp01((165 - angle) / 20);
}

function shapeFactor(quad: Quad): number {
    let factor = 1;
    for (let i = 0; i < 4; i++) {
        factor *= angleFactor(angleAt(quad[(i + 3) % 4], quad[i], quad[(i + 1) % 4]));
    }
    const [tl, tr, br, bl] = quad;
    const w = (distance(tl, tr) + distance(bl, br)) / 2;
    const h = (distance(tl, bl) + distance(tr, br)) / 2;
    const ratio = Math.max(w, h) / (Math.min(w, h) || 1);
    return factor * (ratio <= 3 ? 1 : clamp01((6 - ratio) / 3));
}

/**
 * Évalue des quadrilatères candidats (ordonnés HG, HD, BD, BG) : support de bord sur les 4 côtés,
 * « papier » à l'intérieur, contraste dedans/dehors, intérieur sans bords, forme, aire.
 * Pur (typed arrays) : aucune dépendance à OpenCV. Les cumuls par ligne sont calculés une fois.
 */
export class QuadScorer {
    private readonly paperRows: Int32Array;
    private readonly edgeRows: Int32Array;

    constructor(private readonly maps: ScoringMaps) {
        this.paperRows = rowPrefix(maps.paper, maps.width, maps.height);
        this.edgeRows = rowPrefix(maps.edgesThin, maps.width, maps.height);
    }

    private countIn(prefix: Int32Array, quad: Quad): { count: number; pixels: number } {
        const { width, height } = this.maps;
        let count = 0;
        let pixels = 0;
        for (const { y, xl, xr } of rowSpans(quad, height)) {
            const from = Math.max(0, Math.ceil(xl));
            const to = Math.min(width - 1, Math.floor(xr));
            if (to < from) continue;
            const base = y * (width + 1);
            count += prefix[base + to + 1] - prefix[base + from];
            pixels += to - from + 1;
        }
        return { count, pixels };
    }

    private inside(x: number, y: number): boolean {
        const { width, height } = this.maps;
        return x >= BORDER_MARGIN && y >= BORDER_MARGIN && x <= width - 1 - BORDER_MARGIN && y <= height - 1 - BORDER_MARGIN;
    }

    private edgeSupport(a: Point, b: Point): number {
        const { width, edgesFat } = this.maps;
        let supported = 0;
        let counted = 0;
        for (let s = 0; s < SAMPLES_PER_SIDE; s++) {
            const t = (s + 0.5) / SAMPLES_PER_SIDE;
            const x = Math.round(a.x + (b.x - a.x) * t);
            const y = Math.round(a.y + (b.y - a.y) * t);
            if (!this.inside(x, y)) continue; // côté qui sort du cadre : pas d'information
            counted++;
            if (edgesFat[y * width + x]) supported++;
        }
        return counted ? supported / counted : NEUTRAL;
    }

    /** Contraste signé (intérieur − extérieur) / 64 le long d'un côté, dans [-1, 1] ; null si le côté sort du cadre. */
    private sideContrast(a: Point, b: Point): number | null {
        const { width, height, gray } = this.maps;
        const length = distance(a, b) || 1;
        const nx = -(b.y - a.y) / length; // normale vers l'intérieur (quadrilatère ordonné, sens horaire)
        const ny = (b.x - a.x) / length;
        // Bande intérieure très proche du bord : les marges d'un document sont étroites, un en-tête ou un trait de
        // tableau tout près du bord ne doit pas passer pour l'extérieur. Bande extérieure un peu plus large.
        const size = Math.max(width, height);
        const innerOffset = Math.max(3, Math.round(INNER_OFFSET_RATIO * size));
        const outerOffset = Math.max(4, Math.round(OUTER_OFFSET_RATIO * size));
        let sum = 0;
        let counted = 0;
        for (let s = 0; s < CONTRAST_SAMPLES_PER_SIDE; s++) {
            const t = (s + 0.5) / CONTRAST_SAMPLES_PER_SIDE;
            const px = a.x + (b.x - a.x) * t;
            const py = a.y + (b.y - a.y) * t;
            const ix = Math.round(px + nx * innerOffset);
            const iy = Math.round(py + ny * innerOffset);
            const ox = Math.round(px - nx * outerOffset);
            const oy = Math.round(py - ny * outerOffset);
            if (!this.inside(ix, iy) || !this.inside(ox, oy)) continue;
            sum += gray[iy * width + ix] - gray[oy * width + ox];
            counted++;
        }
        return counted ? Math.max(-1, Math.min(1, sum / counted / FULL_CONTRAST_LEVELS)) : null;
    }

    /**
     * Densité de bords (par unité de périmètre de `inner`) dans l'anneau entre `outer` et `inner`, hors leurs
     * propres contours. ≈ 0 quand `inner` est posé sur un support uniforme (feuille sur sous-main) ; élevée quand
     * du contenu (en-tête, tableau) sépare les deux, c'est-à-dire quand `inner` n'est qu'une partie de `outer`.
     */
    ringEdgeDensity(outer: Quad, inner: Quad): number {
        const { width, height } = this.maps;
        const core = shrink(outer, RING_OUTER_SHRINK);
        const grown = shrink(inner, RING_INNER_GROW);
        // Bords dans le cœur de `outer` mais hors de `inner` agrandi : on retire l'intersection des deux polygones, ligne par ligne
        const grownSpans = new Map(rowSpans(grown, height).map((s) => [s.y, s]));
        let ring = 0;
        for (const { y, xl, xr } of rowSpans(core, height)) {
            const base = y * (width + 1);
            const from = Math.max(0, Math.ceil(xl));
            const to = Math.min(width - 1, Math.floor(xr));
            if (to < from) continue;
            ring += this.edgeRows[base + to + 1] - this.edgeRows[base + from];
            const other = grownSpans.get(y);
            if (!other) continue;
            const a = Math.max(from, Math.ceil(other.xl));
            const b = Math.min(to, Math.floor(other.xr));
            if (b >= a) ring -= this.edgeRows[base + b + 1] - this.edgeRows[base + a];
        }
        const perimeter = [0, 1, 2, 3].reduce((s, i) => s + distance(inner[i], inner[(i + 1) % 4]), 0) || 1;
        return Math.max(0, ring) / perimeter;
    }

    score(quad: Quad): QuadScore {
        const { width, height } = this.maps;
        const sides = [0, 1, 2, 3].map((i) => [quad[i], quad[(i + 1) % 4]] as const);

        const supports = sides.map(([a, b]) => this.edgeSupport(a, b));
        const edgeMin = Math.min(...supports);
        const edgeMean = supports.reduce((s, v) => s + v, 0) / 4;
        const edge = 0.6 * edgeMin + 0.4 * edgeMean;

        // Contraste dans le même sens sur les 4 côtés (document plus clair que son support, ou l'inverse) : un
        // quadrilatère dont certains côtés longent l'intérieur d'une feuille (bloc foncé sur papier blanc) change de sens
        const signed = sides.map(([a, b]) => this.sideContrast(a, b));
        const known = signed.filter((v): v is number => v !== null);
        const direction = known.reduce((s, v) => s + v, 0) >= 0 ? 1 : -1;
        const contrasts = signed.map((v) => (v === null ? NEUTRAL : clamp01(direction * v)));
        const contrastMin = Math.min(...contrasts);
        const contrast = 0.6 * contrastMin + 0.4 * (contrasts.reduce((s, v) => s + v, 0) / 4);

        const inner = this.countIn(this.paperRows, quad);
        const paper = inner.pixels ? clamp01(inner.count / inner.pixels / 0.8) : 0;

        const perimeter = sides.reduce((s, [a, b]) => s + distance(a, b), 0) || 1;
        const interiorEdges = this.countIn(this.edgeRows, shrink(quad, INTERIOR_SHRINK)).count;
        const interior = 1 - clamp01(interiorEdges / perimeter / FULL_INTERIOR_EDGE_DENSITY);

        const areaScore = clamp01(polygonArea(quad) / (width * height) / AREA_BONUS_CAP);
        const shape = shapeFactor(quad);

        const total = shape * (
            WEIGHTS.edge * edge
            + WEIGHTS.interior * interior
            + WEIGHTS.paper * paper
            + WEIGHTS.contrast * contrast
            + WEIGHTS.area * areaScore
        );
        return { total, edge, edgeMean, edgeMin, contrast, contrastMin, paper, interior, shape, area: areaScore };
    }
}

/** Seuils d'acceptation : un candidat doit être réellement bordé de contours et contrasté. */
export const MIN_TOTAL_SCORE = 0.5;
export const MIN_EDGE_MEAN = 0.4;
export const MIN_EDGE_SIDE = 0.15;
export const MIN_CONTRAST = 0.12;
/** Contraste minimal quand chaque côté est solidement bordé de contours (feuille blanche sur bureau clair). */
export const MIN_CONTRAST_WELL_SUPPORTED = 0.05;
export const WELL_SUPPORTED_SIDE = 0.7;

export function isPlausible(score: QuadScore): boolean {
    const minContrast = score.edgeMin >= WELL_SUPPORTED_SIDE ? MIN_CONTRAST_WELL_SUPPORTED : MIN_CONTRAST;
    return (
        score.total >= MIN_TOTAL_SCORE
        && score.edgeMean >= MIN_EDGE_MEAN
        && score.edgeMin >= MIN_EDGE_SIDE
        && score.contrast >= minContrast
    );
}
