import { describe, it, expect } from 'vitest';
import type { Quad } from '@/lib/documentScanner/geometry';
import { QuadScorer, isPlausible, type QuadScore } from '@/lib/documentScanner/quadScoring';

const W = 200;
const H = 150;

const rectQuad = (x0: number, y0: number, x1: number, y1: number): Quad => [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];

function fillRect(map: Uint8Array, x0: number, y0: number, x1: number, y1: number, value: number) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) map[y * W + x] = value;
}

/** Trace le contour d'un rectangle sur une carte de bords (épaisseur `t`). */
function strokeRect(map: Uint8Array, x0: number, y0: number, x1: number, y1: number, t = 1) {
    fillRect(map, x0, y0, x1, y0 + t, 255);
    fillRect(map, x0, y1 - t, x1, y1, 255);
    fillRect(map, x0, y0, x0 + t, y1, 255);
    fillRect(map, x1 - t, y0, x1, y1, 255);
}

function blank() {
    return {
        width: W,
        height: H,
        gray: new Uint8Array(W * H).fill(60),
        edgesThin: new Uint8Array(W * H),
        edgesFat: new Uint8Array(W * H),
        paper: new Uint8Array(W * H),
    };
}

describe('documentScanner/quadScoring', () => {
    it('une feuille bordée de contours, claire et contrastée est plausible et bien notée', () => {
        const maps = blank();
        fillRect(maps.gray, 40, 30, 160, 120, 230);
        fillRect(maps.paper, 40, 30, 160, 120, 255);
        strokeRect(maps.edgesThin, 40, 30, 160, 120);
        strokeRect(maps.edgesFat, 37, 27, 163, 123, 7);

        const score = new QuadScorer(maps).score(rectQuad(40, 30, 160, 120));
        expect(score.edgeMean).toBeGreaterThan(0.9);
        expect(score.edgeMin).toBeGreaterThan(0.9);
        expect(score.contrast).toBeGreaterThan(0.9);
        expect(score.paper).toBeGreaterThan(0.9);
        expect(score.interior).toBeGreaterThan(0.9);
        expect(score.shape).toBe(1);
        expect(isPlausible(score)).toBe(true);
    });

    it('un quadrilatère sans bords ni contraste n\'est pas plausible', () => {
        const maps = blank();
        const score = new QuadScorer(maps).score(rectQuad(30, 20, 170, 130));
        expect(score.edgeMean).toBeLessThan(0.1);
        expect(isPlausible(score)).toBe(false);
    });

    it('un côté sans aucun bord fait chuter le support (le côté le plus faible compte)', () => {
        const maps = blank();
        fillRect(maps.gray, 40, 30, 160, 120, 230);
        // Trois côtés seulement
        fillRect(maps.edgesFat, 37, 27, 163, 34, 255);
        fillRect(maps.edgesFat, 37, 27, 44, 123, 255);
        fillRect(maps.edgesFat, 156, 27, 163, 123, 255);
        const score = new QuadScorer(maps).score(rectQuad(40, 30, 160, 120));
        expect(score.edgeMin).toBeLessThan(0.1);
        expect(score.edgeMean).toBeCloseTo(0.75, 1);
        expect(isPlausible(score)).toBe(false);
    });

    it('un set qui entoure la feuille perd face à la feuille (bords intérieurs, peu de papier)', () => {
        const maps = blank();
        fillRect(maps.gray, 10, 10, 190, 140, 150); // set
        fillRect(maps.gray, 60, 40, 140, 110, 235); // feuille
        fillRect(maps.paper, 60, 40, 140, 110, 255);
        for (const [x0, y0, x1, y1] of [[10, 10, 190, 140], [60, 40, 140, 110]]) {
            strokeRect(maps.edgesThin, x0, y0, x1, y1);
            strokeRect(maps.edgesFat, x0 - 3, y0 - 3, x1 + 3, y1 + 3, 7);
        }
        const scorer = new QuadScorer(maps);
        const sheet = scorer.score(rectQuad(60, 40, 140, 110));
        const set = scorer.score(rectQuad(10, 10, 190, 140));
        expect(set.interior).toBeLessThan(sheet.interior);
        expect(set.paper).toBeLessThan(sheet.paper);
        expect(sheet.total).toBeGreaterThan(set.total);
    });

    it('pénalise les angles extrêmes et les rapports de côtés absurdes', () => {
        const scorer = new QuadScorer(blank());
        const sliver: Quad = [{ x: 10, y: 10 }, { x: 190, y: 10 }, { x: 190, y: 20 }, { x: 10, y: 20 }];
        expect(scorer.score(sliver).shape).toBe(0);
        const sharp: Quad = [{ x: 20, y: 20 }, { x: 180, y: 25 }, { x: 175, y: 120 }, { x: 150, y: 28 }];
        expect(scorer.score(sharp).shape).toBeLessThan(0.5);
        expect(scorer.score(rectQuad(20, 20, 180, 130)).shape).toBe(1);
    });

    it('l\'intérieur d\'un document ordinaire (quelques traits) ne sature pas à 0', () => {
        const maps = blank();
        fillRect(maps.gray, 40, 30, 160, 120, 230);
        strokeRect(maps.edgesThin, 40, 30, 160, 120);
        // Un trait horizontal (≈ 100 px) et un vertical (≈ 70 px) à l'intérieur : densité ≈ 0,4 par unité de périmètre
        fillRect(maps.edgesThin, 50, 75, 150, 76, 255);
        fillRect(maps.edgesThin, 100, 40, 101, 110, 255);
        const score = new QuadScorer(maps).score(rectQuad(40, 30, 160, 120));
        expect(score.interior).toBeGreaterThan(0.7);
    });

    it('contraste de même sens sur les 4 côtés (clair sur sombre, ou l\'inverse) ; un sens variable donne 0 au côté le plus faible', () => {
        const maps = blank();
        fillRect(maps.gray, 20, 10, 180, 140, 230); // feuille claire sur fond sombre
        fillRect(maps.gray, 60, 40, 120, 110, 40); // bloc foncé sur la feuille

        const scorer = new QuadScorer(maps);
        const sheet = scorer.score(rectQuad(20, 10, 180, 140));
        expect(sheet.contrastMin).toBeGreaterThan(0.8);

        // Document sombre sur fond clair : le sens est inversé sur les 4 côtés, toujours cohérent
        const darkOnLight = blank();
        darkOnLight.gray.fill(220);
        fillRect(darkOnLight.gray, 60, 40, 120, 110, 40);
        expect(new QuadScorer(darkOnLight).score(rectQuad(60, 40, 120, 110)).contrastMin).toBeGreaterThan(0.8);

        // Côtés gauche/droit le long du bloc (intérieur plus sombre), haut/bas le long de la feuille (intérieur plus clair)
        const mixed = scorer.score(rectQuad(60, 10, 120, 140));
        expect(mixed.contrastMin).toBe(0);
        expect(mixed.contrast).toBeLessThan(sheet.contrast);
    });

    it('contraste faible mais côtés solidement bordés : plausible ; sans bords solides : non', () => {
        const base: QuadScore = {
            total: 0.7, edge: 0.9, edgeMean: 0.9, edgeMin: 0.8, contrast: 0.07, contrastMin: 0.07,
            paper: 1, interior: 0.8, shape: 1, area: 0.5,
        };
        expect(isPlausible(base)).toBe(true); // 0,07 < 0,12 mais chaque côté ≥ 0,7
        expect(isPlausible({ ...base, edgeMin: 0.6 })).toBe(false);
        expect(isPlausible({ ...base, contrast: 0.03 })).toBe(false);
    });

    describe('ringEdgeDensity', () => {
        const outer = rectQuad(20, 10, 180, 140);
        const inner = rectQuad(60, 40, 140, 110);

        it('≈ 0 quand seuls les contours des deux quadrilatères sont présents (feuille sur support uniforme)', () => {
            const maps = blank();
            strokeRect(maps.edgesThin, 20, 10, 180, 140);
            strokeRect(maps.edgesThin, 60, 40, 140, 110);
            expect(new QuadScorer(maps).ringEdgeDensity(outer, inner)).toBeLessThan(0.02);
        });

        it('élevée quand du contenu occupe l\'anneau (bandeau, tableau)', () => {
            const maps = blank();
            strokeRect(maps.edgesThin, 20, 10, 180, 140);
            strokeRect(maps.edgesThin, 60, 40, 140, 110);
            strokeRect(maps.edgesThin, 30, 18, 170, 34); // bandeau dans l'anneau
            expect(new QuadScorer(maps).ringEdgeDensity(outer, inner)).toBeGreaterThan(0.3);
        });
    });

    it('les côtés qui sortent du cadre ne sont pas comptés comme manquants', () => {
        const maps = blank();
        fillRect(maps.gray, 0, 30, 160, 120, 230);
        strokeRect(maps.edgesFat, 0, 27, 163, 123, 7);
        const score = new QuadScorer(maps).score(rectQuad(0, 30, 160, 120));
        expect(score.edgeMin).toBeGreaterThan(0.4);
    });
});
