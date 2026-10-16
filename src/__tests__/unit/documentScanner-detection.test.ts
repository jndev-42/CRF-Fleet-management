// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { findDocumentQuad, warpMat, type OpenCv } from '@/lib/documentScanner/opencv';
import { distance, orderCorners, type Point, type Quad } from '@/lib/documentScanner/geometry';
import { QuadTracker, SWITCH_COUNT } from '@/lib/documentScanner/quadTracker';

// Test avec le VRAI moteur OpenCV (wasm), chargé comme le ferait Node : l'export est un « thenable »
// qui se renvoie lui-même, on l'attend via onRuntimeInitialized puis on retire `then`.
const nodeRequire = createRequire(import.meta.url);

const W = 640;
const H = 480;
const DIAGONAL = Math.hypot(W, H);
const CORNER_TOLERANCE = 0.03 * DIAGONAL;

let cv: OpenCv;

beforeAll(async () => {
    const raw = nodeRequire('@techstark/opencv-js') as { Mat?: unknown; then?: unknown; onRuntimeInitialized?: () => void };
    if (typeof raw.Mat !== 'function') {
        await new Promise<void>((resolve) => {
            raw.onRuntimeInitialized = () => resolve();
        });
    }
    delete raw.then;
    cv = raw as unknown as OpenCv;
}, 60_000);

/** Générateur pseudo-aléatoire déterministe (LCG). */
function makeRandom(seed: number) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

interface SceneStyle {
    /** Niveau de gris moyen du fond */
    background: number;
    /** Amplitude du bruit du fond (crête à crête) */
    noise: number;
    /** Niveau de gris de la feuille */
    sheet: number;
    /** Rampe d'éclairage gauche → droite ajoutée au fond (met en échec un seuillage global type Otsu) */
    ramp?: number;
    /** Feuille = formulaire chargé (bandeau, titre en gras, grille, case de signature) au lieu de lignes de texte */
    form?: boolean;
    /** Fond uniforme (sans dégradé ni rampe) : seul le bruit varie */
    flat?: boolean;
}

const DARK_DESK: SceneStyle = { background: 90, noise: 24, sheet: 238 };
/** Éclairage très inégal : seul le gradient local du bord de la feuille permet de la retrouver. */
const RAMP_DESK: SceneStyle = { background: 50, noise: 20, sheet: 238, ramp: 150 };
/** Feuille blanche sur bureau clair : le contraste du bord n'est que d'environ 45 niveaux. */
const LIGHT_DESK: SceneStyle = { background: 190, noise: 14, sheet: 235 };

const backgroundLevel = (style: SceneStyle, x: number) => style.background + (x / W) * (12 + (style.ramp ?? 0));

/** Fond gris texturé : dégradé doux + bruit. */
function backgroundRgba(seed: number, style: SceneStyle = DARK_DESK): Uint8Array {
    const random = makeRandom(seed);
    const data = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const base = style.flat ? style.background : backgroundLevel(style, x) + (y / H) * 8;
            const value = base + (random() - 0.5) * style.noise;
            const i = (y * W + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, value));
            data[i + 3] = 255;
        }
    }
    return data;
}

const SHEET_W = 420;
const SHEET_H = 594;

function fillSheetRect(data: Uint8Array, x0: number, y0: number, x1: number, y1: number, value: number) {
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * SHEET_W + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = value;
        }
    }
}

/**
 * Formulaire réaliste : bandeau d'en-tête gris foncé, titre en gras, grille de tableau aux traits épais
 * (assez larges pour survivre à la fermeture morphologique) et case de signature.
 */
function formSheetRgba(level: number): Uint8Array {
    const data = new Uint8Array(SHEET_W * SHEET_H * 4).fill(level);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    fillSheetRect(data, 20, 20, 400, 80, 85); // bandeau
    fillSheetRect(data, 60, 100, 300, 132, 40); // titre en gras
    for (let y = 160; y <= 440; y += 70) fillSheetRect(data, 20, y, 400, y + 10, 50); // traits horizontaux
    for (const x of [20, 150, 280, 390]) fillSheetRect(data, x, 160, x + 10, 450, 50); // traits verticaux
    fillSheetRect(data, 230, 470, 400, 480, 60); // case de signature
    fillSheetRect(data, 230, 470, 240, 560, 60);
    fillSheetRect(data, 390, 470, 400, 560, 60);
    fillSheetRect(data, 230, 550, 400, 560, 60);
    return data;
}

/** Feuille blanche à l'endroit avec des lignes de « texte » sombres. */
function sheetRgba(level: number, form = false): Uint8Array {
    if (form) return formSheetRgba(level);
    const random = makeRandom(7);
    const data = new Uint8Array(SHEET_W * SHEET_H * 4).fill(level);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    for (let top = 60; top < SHEET_H - 50; top += 24) {
        const left = 36;
        const right = left + 120 + Math.floor(random() * (SHEET_W - 72 - 120));
        for (let y = top; y < top + 5; y++) {
            for (let x = left; x < right; x++) {
                const i = (y * SHEET_W + x) * 4;
                data[i] = data[i + 1] = data[i + 2] = 40;
            }
        }
    }
    return data;
}

/** Pose la feuille en perspective dans le fond (warpPerspective en BORDER_TRANSPARENT). */
function sceneWithDocument(quad: Quad, seed: number, style: SceneStyle = DARK_DESK, decorate?: Decorator) {
    return sceneWithDocuments([quad], seed, style, decorate);
}

/** Retouche le fond (RGBA, W × H) avant la pose des feuilles : bois, objets, set… */
type Decorator = (data: Uint8Array) => void;

/** Plusieurs feuilles dans la même scène. */
function sceneWithDocuments(quads: Quad[], seed: number, style: SceneStyle = DARK_DESK, decorate?: Decorator) {
    const backgroundData = backgroundRgba(seed, style);
    decorate?.(backgroundData);
    const background = cv.matFromArray(H, W, cv.CV_8UC4, Array.from(backgroundData));
    const sheet = cv.matFromArray(SHEET_H, SHEET_W, cv.CV_8UC4, Array.from(sheetRgba(style.sheet, style.form)));
    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, SHEET_W, 0, SHEET_W, SHEET_H, 0, SHEET_H]);
    const BORDER_TRANSPARENT = 5;
    for (const quad of quads) {
        const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y]));
        const matrix = cv.getPerspectiveTransform(srcPts, dstPts);
        cv.warpPerspective(sheet, background, matrix, new cv.Size(W, H), cv.INTER_LINEAR, BORDER_TRANSPARENT, new cv.Scalar());
        dstPts.delete();
        matrix.delete();
    }
    sheet.delete();
    srcPts.delete();
    return background;
}

/**
 * Efface ~10 % du bord haut : sur 60 px (de 15 px hors de la feuille à 45 px dedans), le fond se fond
 * progressivement dans la feuille (doigt / ombre). Sans contraste net, Canny ne trouve plus ce bord.
 */
function fadeTopEdge(scene: InstanceType<OpenCv['Mat']>, quad: Quad, style: SceneStyle) {
    const [tl, tr] = quad;
    const ex = tr.x - tl.x;
    const ey = tr.y - tl.y;
    const length = Math.hypot(ex, ey);
    const nx = -ey / length; // normale vers l'intérieur de la feuille
    const ny = ex / length;
    const data = scene.data;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const vx = x - tl.x;
            const vy = y - tl.y;
            const s = (vx * ex + vy * ey) / (length * length);
            const d = vx * nx + vy * ny;
            if (s < 0.4 || s > 0.5 || d < -15 || d > 45) continue;
            const a = (d + 15) / 60;
            const value = backgroundLevel(style, x) * (1 - a) + style.sheet * a;
            const i = (y * W + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = value;
        }
    }
}

function expectCornersNear(found: Quad | null, truth: Quad) {
    expect(found).not.toBeNull();
    const expected = orderCorners(truth);
    (found as Quad).forEach((corner: Point, i) => {
        expect(distance(corner, expected[i])).toBeLessThan(CORNER_TOLERANCE);
    });
}

const QUADS: Array<[string, Quad]> = [
    ['feuille quasi frontale', [{ x: 120, y: 70 }, { x: 520, y: 85 }, { x: 545, y: 410 }, { x: 95, y: 400 }]],
    ['feuille inclinée et tournée', [{ x: 180, y: 50 }, { x: 560, y: 140 }, { x: 500, y: 440 }, { x: 80, y: 330 }]],
    ['petite feuille (≈ 20 % du cadre)', [{ x: 190, y: 100 }, { x: 440, y: 110 }, { x: 450, y: 360 }, { x: 180, y: 350 }]],
];

describe('documentScanner/opencv — findDocumentQuad (moteur réel)', () => {
    it.each(QUADS)('trouve les 4 coins : %s', (_name, quad) => {
        const scene = sceneWithDocument(quad, 11);
        try {
            expectCornersNear(findDocumentQuad(cv, scene), quad);
        } finally {
            scene.delete();
        }
    }, 30_000);

    it('trouve une feuille blanche sur un bureau clair (bord peu contrasté, ≈ 60 % du cadre)', () => {
        const quad: Quad = [{ x: 70, y: 40 }, { x: 580, y: 70 }, { x: 560, y: 440 }, { x: 50, y: 410 }];
        const scene = sceneWithDocument(quad, 21, LIGHT_DESK);
        try {
            expectCornersNear(findDocumentQuad(cv, scene), quad);
        } finally {
            scene.delete();
        }
    }, 30_000);

    it("retrouve les 4 coins malgré un bord ouvert sur ~10 % (doigt, ombre) grâce à l'enveloppe convexe", () => {
        const quad: Quad = [{ x: 120, y: 70 }, { x: 520, y: 85 }, { x: 545, y: 410 }, { x: 95, y: 400 }];
        const scene = sceneWithDocument(quad, 11, RAMP_DESK);
        fadeTopEdge(scene, quad, RAMP_DESK);
        try {
            expectCornersNear(findDocumentQuad(cv, scene), quad);
        } finally {
            scene.delete();
        }
    }, 30_000);

    describe('contour de référence (suivi)', () => {
        // Deux feuilles valides : la grande (≈ 35 % du cadre) et une plus petite (≈ 17 %)
        const BIG: Quad = [{ x: 30, y: 60 }, { x: 330, y: 70 }, { x: 320, y: 430 }, { x: 40, y: 420 }];
        const SMALL: Quad = [{ x: 380, y: 150 }, { x: 610, y: 150 }, { x: 610, y: 380 }, { x: 380, y: 380 }];

        it('sans référence : le plus grand candidat', () => {
            const scene = sceneWithDocuments([BIG, SMALL], 5);
            try {
                expectCornersNear(findDocumentQuad(cv, scene), BIG);
            } finally {
                scene.delete();
            }
        }, 30_000);

        it('la référence ne départage que des feuilles de taille comparable (≥ 80 % de la plus grande)', () => {
            const a: Quad = [{ x: 30, y: 80 }, { x: 260, y: 85 }, { x: 255, y: 410 }, { x: 25, y: 405 }]; // ≈ 75 000 px²
            const b: Quad = [{ x: 350, y: 100 }, { x: 580, y: 100 }, { x: 580, y: 380 }, { x: 350, y: 380 }]; // ≈ 64 000 px²
            const scene = sceneWithDocuments([a, b], 5);
            try {
                expectCornersNear(findDocumentQuad(cv, scene, null), a);
                expectCornersNear(findDocumentQuad(cv, scene, b), b);
                expectCornersNear(findDocumentQuad(cv, scene, a), a);
            } finally {
                scene.delete();
            }
        }, 30_000);

        it('une référence sur un candidat nettement plus petit ne l\'emporte pas sur la grande feuille', () => {
            const scene = sceneWithDocuments([BIG, SMALL], 5);
            try {
                expectCornersNear(findDocumentQuad(cv, scene, SMALL), BIG);
            } finally {
                scene.delete();
            }
        }, 30_000);

        it('suivi verrouillé sur un petit rectangle : adopte la feuille entière en 3 images', () => {
            const tracker = new QuadTracker();
            const smallOnly = sceneWithDocument(SMALL, 5);
            const both = sceneWithDocuments([BIG, SMALL], 5);
            try {
                // Une image où seul le petit rectangle est visible : le suivi s'y accroche
                tracker.update(findDocumentQuad(cv, smallOnly, tracker.quad), W, H, 0);
                expectCornersNear(tracker.quad, SMALL);

                // La feuille entière devient visible : la détection la renvoie malgré la référence,
                // et le suivi bascule après SWITCH_COUNT images cohérentes (pas avant)
                for (let frame = 1; frame < SWITCH_COUNT; frame++) {
                    tracker.update(findDocumentQuad(cv, both, tracker.quad), W, H, frame * 125);
                    expectCornersNear(tracker.quad, SMALL);
                }
                tracker.update(findDocumentQuad(cv, both, tracker.quad), W, H, SWITCH_COUNT * 125);
                expectCornersNear(tracker.quad, BIG);
            } finally {
                smallOnly.delete();
                both.delete();
            }
        }, 30_000);

        it('feuille avec un rectangle plus petit à l\'intérieur : la feuille est renvoyée', () => {
            const quad: Quad = [{ x: 120, y: 70 }, { x: 520, y: 85 }, { x: 545, y: 410 }, { x: 95, y: 400 }];
            const scene = sceneWithDocument(quad, 11);
            // Bloc gris foncé à l'intérieur de la feuille (≈ 20 % de sa surface)
            const data = scene.data;
            for (let y = 160; y < 300; y++) {
                for (let x = 200; x < 400; x++) {
                    const i = (y * W + x) * 4;
                    data[i] = data[i + 1] = data[i + 2] = 60;
                }
            }
            try {
                expectCornersNear(findDocumentQuad(cv, scene, quad), quad);
                expectCornersNear(findDocumentQuad(cv, scene, null), quad);
            } finally {
                scene.delete();
            }
        }, 30_000);
    });

    describe('warpMat — mode original', () => {
        // Image RGBA 210 x 297 (rapport A4 exact : pas d'aimantation, la taille de sortie reste identique)
        const SRC_W = 210;
        const SRC_H = 297;
        const frontal: Quad = [{ x: 0, y: 0 }, { x: SRC_W, y: 0 }, { x: SRC_W, y: SRC_H }, { x: 0, y: SRC_H }];

        function colorfulSource() {
            const data = new Uint8Array(SRC_W * SRC_H * 4);
            for (let y = 0; y < SRC_H; y++) {
                for (let x = 0; x < SRC_W; x++) {
                    const i = (y * SRC_W + x) * 4;
                    data[i] = (x * 255) / SRC_W; // dégradés de couleur, ombre diagonale
                    data[i + 1] = (y * 255) / SRC_H;
                    data[i + 2] = 120 + ((x + y) % 40);
                    data[i + 3] = 255;
                }
            }
            return cv.matFromArray(SRC_H, SRC_W, cv.CV_8UC4, Array.from(data));
        }

        const meanAbsDiff = (a: Uint8Array, b: Uint8Array) => {
            let sum = 0;
            for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
            return sum / a.length;
        };

        it('ne modifie pas les couleurs d\'une image déjà frontale (à l\'interpolation près)', () => {
            const src = colorfulSource();
            const out = warpMat(cv, src, frontal, 'original');
            try {
                expect([out.cols, out.rows]).toEqual([SRC_W, SRC_H]);
                expect(meanAbsDiff(src.data, out.data)).toBeLessThan(1);
            } finally {
                src.delete();
                out.delete();
            }
        });

        it('aucune bande blanche ni noire : un quadrilatère qui touche ou dépasse le cadre est complété par réplication des bords', () => {
            const grey = cv.matFromArray(SRC_H, SRC_W, cv.CV_8UC4, Array.from(new Uint8Array(SRC_W * SRC_H * 4).fill(100)));
            const touching = frontal;
            const overshooting: Quad = [{ x: -15, y: -15 }, { x: SRC_W + 12, y: -10 }, { x: SRC_W + 10, y: SRC_H + 14 }, { x: -12, y: SRC_H + 9 }];
            try {
                for (const quad of [touching, overshooting]) {
                    const out = warpMat(cv, grey, quad, 'original');
                    try {
                        const { cols, rows, data } = out;
                        const edges = [0, 1, rows - 2, rows - 1]; // premières et dernières lignes
                        for (const y of edges) {
                            for (let x = 0; x < cols; x++) expect(Math.abs(data[(y * cols + x) * out.channels()] - 100)).toBeLessThanOrEqual(2);
                        }
                        for (const x of [0, 1, cols - 2, cols - 1]) {
                            for (let y = 0; y < rows; y++) expect(Math.abs(data[(y * cols + x) * out.channels()] - 100)).toBeLessThanOrEqual(2);
                        }
                    } finally {
                        out.delete();
                    }
                }
            } finally {
                grey.delete();
            }
        });

        it('les modes couleur et noir & blanc, eux, modifient l\'image', () => {
            const src = colorfulSource();
            const color = warpMat(cv, src, frontal, 'color');
            const bw = warpMat(cv, src, frontal, 'bw');
            try {
                expect(meanAbsDiff(src.data.slice(0, color.data.length), color.data)).toBeGreaterThan(5);
                expect(bw.channels()).toBe(1);
            } finally {
                src.delete();
                color.delete();
                bw.delete();
            }
        });
    });

    it('ne détecte rien sur un fond texturé sans document', () => {
        const scene = cv.matFromArray(H, W, cv.CV_8UC4, Array.from(backgroundRgba(3)));
        try {
            expect(findDocumentQuad(cv, scene)).toBeNull();
        } finally {
            scene.delete();
        }
    }, 30_000);
});

// ───────────────────────────── Scènes difficiles ─────────────────────────────

const FOCAL = 520; // ≈ 0,8 × la largeur : focale typique d'un téléphone
const DEG = Math.PI / 180;

/** Feuille A4 projetée par une caméra à sténopé (point principal au centre), inclinée de `tilt`° (haut éloigné) et tournée de `yaw`°. */
function obliqueSheet(tilt: number, yaw = 0, roll = 0): Quad {
    const [sheetW, sheetH] = [210, 297];
    const distance = (FOCAL * sheetH) / (0.8 * H);
    const [a, b, c] = [tilt * DEG, yaw * DEG, roll * DEG];
    return ([[-sheetW / 2, -sheetH / 2], [sheetW / 2, -sheetH / 2], [sheetW / 2, sheetH / 2], [-sheetW / 2, sheetH / 2]] as const).map(
        ([x, y]) => {
            const y1 = y * Math.cos(a);
            const z1 = -y * Math.sin(a); // le haut (y < 0) s'éloigne
            const x2 = x * Math.cos(b) + z1 * Math.sin(b);
            const z2 = -x * Math.sin(b) + z1 * Math.cos(b);
            const x3 = x2 * Math.cos(c) - y1 * Math.sin(c);
            const y3 = x2 * Math.sin(c) + y1 * Math.cos(c);
            return { x: W / 2 + (FOCAL * x3) / (distance + z2), y: H / 2 + (FOCAL * y3) / (distance + z2) };
        },
    ) as Quad;
}

/** Atténue le contraste le long d'un côté (bord éloigné peu contrasté en vue oblique). */
function weakenSide(scene: InstanceType<OpenCv['Mat']>, quad: Quad, side: number, style: SceneStyle, strength: number) {
    const a = quad[side];
    const b = quad[(side + 1) % 4];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const length = Math.hypot(ex, ey);
    const [nx, ny] = [-ey / length, ex / length];
    const data = scene.data;
    const depth = 24;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const s = ((x - a.x) * ex + (y - a.y) * ey) / (length * length);
            const d = (x - a.x) * nx + (y - a.y) * ny;
            if (s < 0 || s > 1 || d < 0 || d > depth) continue;
            const k = strength * (1 - d / depth);
            const i = (y * W + x) * 4;
            const bg = backgroundLevel(style, x);
            for (let c = 0; c < 3; c++) data[i + c] = data[i + c] * (1 - k) + bg * k;
        }
    }
}

function fillRect(data: Uint8Array, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number]) {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
            const i = (y * W + x) * 4;
            data[i] = rgb[0];
            data[i + 1] = rgb[1];
            data[i + 2] = rgb[2];
        }
    }
}

/** Table en bois : bandes bruitées brunes + rectangles et traits colorés aléatoires. */
const clutteredWood: Decorator = (data) => {
    const random = makeRandom(99);
    for (let y = 0; y < H; y++) {
        const stripe = 28 * Math.sin(y / 5 + 3 * Math.sin(y / 31)) + (random() - 0.5) * 12;
        for (let x = 0; x < W; x++) {
            const grain = (random() - 0.5) * 26 + 10 * Math.sin(x / 40 + y / 90);
            const i = (y * W + x) * 4;
            data[i] = Math.max(0, Math.min(255, 125 + stripe + grain));
            data[i + 1] = Math.max(0, Math.min(255, 85 + stripe + grain));
            data[i + 2] = Math.max(0, Math.min(255, 50 + stripe + grain));
        }
    }
    for (let n = 0; n < 14; n++) {
        const x0 = Math.floor(random() * W);
        const y0 = Math.floor(random() * H);
        const rgb: [number, number, number] = [random() * 255, random() * 255, random() * 255];
        if (n % 2) fillRect(data, x0, y0, x0 + 20 + random() * 90, y0 + 15 + random() * 70, rgb); // rectangle
        else fillRect(data, x0, y0, x0 + 80 + random() * 200, y0 + 2 + random() * 3, rgb); // trait
    }
};

describe('documentScanner/opencv — scènes difficiles (moteur réel)', () => {
    it('vue très oblique (inclinaison 60°) avec un bord éloigné peu contrasté (≈ 30 niveaux)', () => {
        const quad = obliqueSheet(60, 12);
        const scene = sceneWithDocument(quad, 31, DARK_DESK);
        weakenSide(scene, quad, 0, DARK_DESK, 0.8); // côté haut = bord éloigné
        try {
            expectCornersNear(findDocumentQuad(cv, scene), quad);
        } finally {
            scene.delete();
        }
    }, 30_000);

    it('fond encombré (bois, rectangles et traits colorés) avec un objet sombre contre un coin', () => {
        const quad: Quad = [{ x: 110, y: 60 }, { x: 500, y: 80 }, { x: 530, y: 400 }, { x: 90, y: 380 }];
        const scene = sceneWithDocument(quad, 41, DARK_DESK, clutteredWood);
        // Objet sombre collé au coin bas-droit, à l'extérieur de la feuille
        const data = scene.data;
        const [x, y] = [Math.round(quad[2].x), Math.round(quad[2].y)];
        for (let yy = y; yy < Math.min(H, y + 60); yy++) {
            for (let xx = x; xx < Math.min(W, x + 70); xx++) {
                const i = (yy * W + xx) * 4;
                data[i] = data[i + 1] = data[i + 2] = 20;
            }
        }
        try {
            expectCornersNear(findDocumentQuad(cv, scene), quad);
        } finally {
            scene.delete();
        }
    }, 30_000);

    it.each([175, 205])('feuille posée sur un set rectangulaire plus grand et plus clair que la table (set à %i)', (setLevel) => {
        const quad: Quad = [{ x: 190, y: 120 }, { x: 440, y: 130 }, { x: 450, y: 350 }, { x: 180, y: 340 }];
        const withSet: Decorator = (data) => fillRect(data, 70, 50, 570, 430, [setLevel, setLevel, setLevel]);
        const scene = sceneWithDocument(quad, 51, DARK_DESK, withSet);
        try {
            expectCornersNear(findDocumentQuad(cv, scene), quad);
        } finally {
            scene.delete();
        }
    }, 30_000);

    it('feuille sur fond quasi blanc : pas de faux contour aberrant (rien, ou la feuille)', () => {
        const quad: Quad = [{ x: 120, y: 70 }, { x: 520, y: 85 }, { x: 545, y: 410 }, { x: 95, y: 400 }];
        const whiteDesk: SceneStyle = { background: 224, noise: 10, sheet: 240 };
        const scene = sceneWithDocument(quad, 61, whiteDesk);
        try {
            const found = findDocumentQuad(cv, scene);
            if (found) expectCornersNear(found, quad);
        } finally {
            scene.delete();
        }
    }, 30_000);

    it('un coin masqué par un doigt sombre : les 4 coins sont retrouvés', () => {
        const quad: Quad = [{ x: 120, y: 70 }, { x: 520, y: 85 }, { x: 545, y: 410 }, { x: 95, y: 400 }];
        const scene = sceneWithDocument(quad, 71, DARK_DESK);
        // Doigt sombre sur le coin haut-droit (≈ 30 px)
        const data = scene.data;
        const [cx, cy] = [quad[1].x, quad[1].y];
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (Math.hypot(x - cx, y - cy) < 30) {
                    const i = (y * W + x) * 4;
                    data[i] = data[i + 1] = data[i + 2] = 35;
                }
            }
        }
        try {
            expectCornersNear(findDocumentQuad(cv, scene), quad);
        } finally {
            scene.delete();
        }
    }, 30_000);

    describe('formulaire chargé sur un grand support clair', () => {
        // Feuille ≈ 30 % du cadre, posée sur un sous-main rectangulaire ≈ 74 % du cadre, sur une table sombre
        const SHEET_QUAD: Quad = [{ x: 195, y: 55 }, { x: 445, y: 60 }, { x: 455, y: 425 }, { x: 185, y: 420 }];
        const MAT_QUAD: Quad = [{ x: 60, y: 25 }, { x: 590, y: 25 }, { x: 590, y: 455 }, { x: 60, y: 455 }];
        const formScene = (matLevel: number) =>
            sceneWithDocument(
                SHEET_QUAD,
                81,
                { background: 70, noise: 16, sheet: 238, form: true },
                (data) => fillRect(data, 60, 25, 590, 455, [matLevel, matLevel, matLevel]),
            );

        it.each([185, 215])('renvoie la feuille, pas le sous-main (sous-main à %i)', (matLevel) => {
            const scene = formScene(matLevel);
            try {
                expectCornersNear(findDocumentQuad(cv, scene), SHEET_QUAD);
            } finally {
                scene.delete();
            }
        }, 30_000);

        it('suivi d\'abord verrouillé sur le sous-main : la feuille est adoptée en 3 images', () => {
            const scene = formScene(200);
            const tracker = new QuadTracker();
            try {
                tracker.update(MAT_QUAD, W, H, 0); // le suivi s'est accroché au sous-main
                expectCornersNear(tracker.quad, MAT_QUAD);
                for (let frame = 1; frame < SWITCH_COUNT; frame++) {
                    tracker.update(findDocumentQuad(cv, scene, tracker.quad), W, H, frame * 125);
                    expectCornersNear(tracker.quad, MAT_QUAD);
                }
                tracker.update(findDocumentQuad(cv, scene, tracker.quad), W, H, SWITCH_COUNT * 125);
                expectCornersNear(tracker.quad, SHEET_QUAD);
            } finally {
                scene.delete();
            }
        }, 30_000);
    });

    it('feuille blanche (235) sur un bureau à peine plus sombre (215) : trouvée malgré le faible contraste', () => {
        const quad: Quad = [{ x: 90, y: 50 }, { x: 540, y: 65 }, { x: 560, y: 420 }, { x: 70, y: 405 }];
        const scene = sceneWithDocument(quad, 91, { background: 215, noise: 12, sheet: 235, flat: true });
        try {
            expectCornersNear(findDocumentQuad(cv, scene), quad);
        } finally {
            scene.delete();
        }
    }, 30_000);

    it('temps d\'analyse moyen raisonnable à 480 px', () => {
        const quad: Quad = [{ x: 110, y: 60 }, { x: 500, y: 80 }, { x: 530, y: 400 }, { x: 90, y: 380 }];
        const scene = sceneWithDocument(quad, 41, DARK_DESK, clutteredWood);
        try {
            for (let i = 0; i < 3; i++) findDocumentQuad(cv, scene); // échauffement
            const runs = 15;
            const start = performance.now();
            for (let i = 0; i < runs; i++) findDocumentQuad(cv, scene);
            const mean = (performance.now() - start) / runs;
            process.stderr.write(`[scanner] analyse moyenne (Node, ${W}x${H}) : ${mean.toFixed(1)} ms\n`);
            expect(mean).toBeLessThan(60);
        } finally {
            scene.delete();
        }
    }, 60_000);
});
