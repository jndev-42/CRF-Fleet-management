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
            const value = backgroundLevel(style, x) + (y / H) * 8 + (random() - 0.5) * style.noise;
            const i = (y * W + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, value));
            data[i + 3] = 255;
        }
    }
    return data;
}

const SHEET_W = 420;
const SHEET_H = 594;

/** Feuille blanche à l'endroit avec des lignes de « texte » sombres. */
function sheetRgba(level: number): Uint8Array {
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
function sceneWithDocument(quad: Quad, seed: number, style: SceneStyle = DARK_DESK) {
    return sceneWithDocuments([quad], seed, style);
}

/** Plusieurs feuilles dans la même scène. */
function sceneWithDocuments(quads: Quad[], seed: number, style: SceneStyle = DARK_DESK) {
    const background = cv.matFromArray(H, W, cv.CV_8UC4, Array.from(backgroundRgba(seed, style)));
    const sheet = cv.matFromArray(SHEET_H, SHEET_W, cv.CV_8UC4, Array.from(sheetRgba(style.sheet)));
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
