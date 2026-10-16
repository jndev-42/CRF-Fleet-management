import { describe, it, expect } from 'vitest';
import {
    clamp,
    fullFrameQuad,
    isConvexQuad,
    isStable,
    orderCorners,
    outputSize,
    polygonArea,
    quadArea,
    scaleQuad,
    type Quad,
} from '@/lib/documentScanner/geometry';

const rect: Quad = [
    { x: 10, y: 10 },
    { x: 110, y: 10 },
    { x: 110, y: 160 },
    { x: 10, y: 160 },
];

describe('documentScanner/geometry', () => {
    it("ordonne les coins HG, HD, BD, BG quel que soit l'ordre d'entrée", () => {
        const shuffled = [rect[2], rect[0], rect[3], rect[1]];
        expect(orderCorners(shuffled)).toEqual(rect);
    });

    it('refuse un nombre de points différent de 4', () => {
        expect(() => orderCorners([{ x: 0, y: 0 }])).toThrow();
    });

    it("calcule l'aire d'un polygone", () => {
        expect(polygonArea(rect)).toBe(100 * 150);
        expect(quadArea(rect)).toBe(15000);
    });

    it('détecte la convexité', () => {
        expect(isConvexQuad(rect)).toBe(true);
        // Papillon : les côtés se croisent
        expect(isConvexQuad([rect[0], rect[2], rect[1], rect[3]])).toBe(false);
        // Concave
        expect(isConvexQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 10 }])).toBe(false);
        expect(isConvexQuad([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
    });

    it('fournit un cadre plein par défaut', () => {
        expect(fullFrameQuad(640, 480)).toEqual([
            { x: 0, y: 0 }, { x: 640, y: 0 }, { x: 640, y: 480 }, { x: 0, y: 480 },
        ]);
    });

    it("met un quadrilatère à l'échelle", () => {
        expect(scaleQuad(rect, 2)[2]).toEqual({ x: 220, y: 320 });
    });

    it('calcule la taille de sortie à partir des bords', () => {
        expect(outputSize(rect)).toEqual({ width: 100, height: 150 });
    });

    it('plafonne la taille de sortie à 2000 px en gardant le ratio', () => {
        const big = scaleQuad(rect, 40); // 4000 x 6000
        expect(outputSize(big)).toEqual({ width: 1333, height: 2000 });
    });

    it('détecte la stabilité entre deux détections', () => {
        const nudged = rect.map((p) => ({ x: p.x + 1, y: p.y + 1 })) as Quad;
        const moved = rect.map((p) => ({ x: p.x + 80, y: p.y })) as Quad;
        expect(isStable(rect, nudged, 640, 480)).toBe(true);
        expect(isStable(rect, moved, 640, 480)).toBe(false);
        expect(isStable(null, rect, 640, 480)).toBe(false);
        expect(isStable(rect, null, 640, 480)).toBe(false);
    });

    it('borne une valeur', () => {
        expect(clamp(5, 0, 3)).toBe(3);
        expect(clamp(-1, 0, 3)).toBe(0);
        expect(clamp(2, 0, 3)).toBe(2);
    });
});
