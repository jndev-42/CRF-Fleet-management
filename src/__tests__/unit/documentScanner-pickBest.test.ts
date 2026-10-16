import { describe, it, expect } from 'vitest';
import type { Quad } from '@/lib/documentScanner/geometry';
import type { QuadScore } from '@/lib/documentScanner/quadScoring';
import { pickBest, type Scored } from '@/lib/documentScanner/documentDetection';

const rect = (x0: number, y0: number, x1: number, y1: number): Quad => [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];

/** Sous-main (≈ 74 % d'un cadre 640 × 480) et feuille posée dessus (≈ 30 %). */
const MAT = rect(60, 25, 590, 455);
const SHEET: Quad = [{ x: 195, y: 55 }, { x: 445, y: 60 }, { x: 455, y: 425 }, { x: 185, y: 420 }];
/** Sous-rectangle de la feuille : même gauche / droite / bas, mais le haut est descendu sous l'en-tête. */
const BELOW_HEADER: Quad = [{ x: 193, y: 102 }, { x: 446, y: 105 }, { x: 455, y: 424 }, { x: 184, y: 420 }];

const scored = (quad: Quad, total: number, overrides: Partial<QuadScore> = {}): Scored => ({
    quad,
    score: {
        total, edge: 0.9, edgeMean: 0.9, edgeMin: 0.9, contrast: 0.8, contrastMin: 0.8,
        paper: 1, interior: 0.8, shape: 1, area: 0.5, ...overrides,
    },
});

const clean = () => 0;
const dirty = () => 0.4;

describe('documentDetection — pickBest', () => {
    it('rien à choisir : null', () => {
        expect(pickBest([], null)).toBeNull();
    });

    it('sans emboîtement ni référence : le meilleur score', () => {
        const a = scored(rect(10, 10, 300, 400), 0.6);
        const b = scored(rect(320, 20, 620, 440), 0.8);
        expect(pickBest([a, b], null)).toBe(b.quad);
    });

    describe('emboîtement : feuille posée sur un support uniforme (anneau propre)', () => {
        it('un candidat plausible contenu dans le gagnant lui est préféré', () => {
            const mat = scored(MAT, 0.81);
            const sheet = scored(SHEET, 0.77);
            expect(pickBest([mat, sheet], null, clean)).toBe(sheet.quad);
        });

        it.each([
            ['côtés insuffisamment bordés', { edgeMin: 0.3 }, 0.77],
            ['contraste de sens variable (un côté change de sens)', { contrastMin: 0.1 }, 0.77],
            ['score trop inférieur (< 85 % du gagnant)', {}, 0.6],
        ])('pas de descente si le candidat intérieur est faible : %s', (_name, overrides, total) => {
            const mat = scored(MAT, 0.81);
            const sheet = scored(SHEET, total, overrides);
            expect(pickBest([mat, sheet], null, clean)).toBe(mat.quad);
        });

        it('pas de descente si l\'intérieur est trop petit (< 25 % de l\'aire) ou n\'est pas contenu', () => {
            const mat = scored(MAT, 0.81);
            const tiny = scored(rect(300, 200, 360, 250), 0.8);
            const outside = scored(rect(500, 380, 700, 520), 0.8);
            expect(pickBest([mat, tiny], null, clean)).toBe(mat.quad);
            expect(pickBest([mat, outside], null, clean)).toBe(mat.quad);
        });

        it('ne descend pas vers un quasi-doublon (≥ 90 % de l\'aire)', () => {
            const mat = scored(MAT, 0.81);
            const almost = scored(rect(64, 29, 586, 451), 0.8);
            expect(pickBest([mat, almost], null, clean)).toBe(mat.quad);
        });
    });

    describe('emboîtement : sous-rectangle d\'un formulaire (anneau sale)', () => {
        it('remonte à la feuille quand le gagnant n\'en partage que trois côtés et que du contenu occupe l\'anneau', () => {
            const sub = scored(BELOW_HEADER, 0.89);
            const sheet = scored(SHEET, 0.87);
            const mat = scored(MAT, 0.82);
            const ring = (outer: Quad, inner: Quad) => (outer === SHEET && inner === BELOW_HEADER ? 0.24 : 0);
            expect(pickBest([sub, sheet, mat], null, ring)).toBe(sheet.quad);
        });

        it('ne remonte pas si l\'anneau est propre', () => {
            const sub = scored(BELOW_HEADER, 0.89);
            const sheet = scored(SHEET, 0.87);
            expect(pickBest([sub, sheet], null, clean)).toBe(sub.quad);
        });

        it('ne remonte pas vers un quadrilatère à peine plus grand dont aucun côté n\'est commun (bruit du fond)', () => {
            const inner = scored(SHEET, 0.97);
            const bigger = scored(
                SHEET.map((p, i) => ({ x: p.x + (i % 3 === 0 ? -14 : 14), y: p.y + (i < 2 ? -12 : 14) })) as Quad,
                0.9,
            );
            expect(pickBest([inner, bigger], null, dirty)).toBe(inner.quad);
        });
    });

    describe('contour de référence (suivi)', () => {
        it('départage deux objets de taille et de score comparables', () => {
            const a = scored(rect(30, 80, 260, 410), 0.8);
            const b = scored(rect(350, 100, 580, 380), 0.78);
            expect(pickBest([a, b], rect(352, 98, 582, 382))).toBe(b.quad);
            expect(pickBest([a, b], rect(28, 82, 262, 412))).toBe(a.quad);
        });

        it('est borné dans les deux sens : un candidat nettement plus grand ou plus petit ne peut pas l\'emporter', () => {
            const sheet = scored(SHEET, 0.87);
            const hugeMat = scored(MAT, 0.8);
            const smallBlock = scored(rect(230, 120, 400, 250), 0.85);
            // Référence posée sur le sous-main, puis sur le petit bloc : la feuille reste le meilleur
            expect(pickBest([sheet, hugeMat, smallBlock], MAT, () => 0.5)).toBe(sheet.quad);
            expect(pickBest([sheet, hugeMat, smallBlock], smallBlock.quad, () => 0.5)).toBe(sheet.quad);
        });

        it('n\'ôte pas au meilleur sa place au profit de ses propres variantes (mêmes côtés, à peine décalées)', () => {
            const best = scored(SHEET, 0.87);
            const mixed = scored(rect(185, 24, 456, 454), 0.8); // haut et bas du sous-main, côtés de la feuille, côtés de la feuille
            expect(pickBest([best, mixed], MAT, clean)).toBe(best.quad);
        });
    });
});
