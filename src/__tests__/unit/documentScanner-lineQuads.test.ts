import { describe, it, expect } from 'vitest';
import { distance, type Point } from '@/lib/documentScanner/geometry';
import { quadsFromSegments, type Segment } from '@/lib/documentScanner/lineQuads';

const W = 640;
const H = 480;

const seg = (a: Point, b: Point): Segment => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });

/** Segments le long des 4 côtés d'un quadrilatère (en coupant chaque côté en deux morceaux espacés). */
function sidesOf([tl, tr, br, bl]: Point[]): Segment[] {
    const sides: Array<[Point, Point]> = [[tl, tr], [tr, br], [br, bl], [bl, tl]];
    return sides.flatMap(([a, b]) => {
        const at = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        return [seg(at(0.05), at(0.45)), seg(at(0.55), at(0.95))];
    });
}

const hasCorners = (quad: Point[], expected: Point[], tolerance: number) =>
    expected.every((e) => quad.some((p) => distance(p, e) <= tolerance));

describe('documentScanner/lineQuads', () => {
    it('retrouve les 4 coins à partir des droites des côtés (rectangle)', () => {
        const rect = [{ x: 100, y: 80 }, { x: 500, y: 80 }, { x: 500, y: 400 }, { x: 100, y: 400 }];
        const quads = quadsFromSegments(sidesOf(rect), W, H);
        expect(quads.length).toBeGreaterThan(0);
        expect(quads.some((q) => hasCorners(q, rect, 2))).toBe(true);
    });

    it('retrouve les coins d\'un trapèze en vue oblique (côtés non parallèles)', () => {
        const trapezoid = [{ x: 200, y: 90 }, { x: 440, y: 100 }, { x: 560, y: 400 }, { x: 90, y: 390 }];
        const quads = quadsFromSegments(sidesOf(trapezoid), W, H);
        expect(quads.some((q) => hasCorners(q, trapezoid, 3))).toBe(true);
    });

    it('retrouve un coin même si les deux côtés qui y mènent sont raccourcis (coin masqué)', () => {
        const rect = [{ x: 100, y: 80 }, { x: 500, y: 80 }, { x: 500, y: 400 }, { x: 100, y: 400 }];
        const segments = sidesOf(rect).filter((s) => !(s.x1 > 450 && s.y1 < 150) && !(s.x1 >= 495 && s.y1 < 150));
        const quads = quadsFromSegments(segments, W, H);
        expect(quads.some((q) => hasCorners(q, rect, 3))).toBe(true);
    });

    it('fonctionne pour un document tourné', () => {
        const angle = (25 * Math.PI) / 180;
        const base = [{ x: -200, y: -150 }, { x: 200, y: -150 }, { x: 200, y: 150 }, { x: -200, y: 150 }];
        const rotated = base.map((p) => ({
            x: 320 + p.x * Math.cos(angle) - p.y * Math.sin(angle),
            y: 240 + p.x * Math.sin(angle) + p.y * Math.cos(angle),
        }));
        const quads = quadsFromSegments(sidesOf(rotated), W, H);
        expect(quads.some((q) => hasCorners(q, rotated, 3))).toBe(true);
    });

    it('ne renvoie rien sans deux droites dans chaque famille', () => {
        expect(quadsFromSegments([], W, H)).toEqual([]);
        const parallel = [seg({ x: 50, y: 100 }, { x: 550, y: 100 }), seg({ x: 50, y: 300 }, { x: 550, y: 300 }),
            seg({ x: 60, y: 100 }, { x: 540, y: 100 }), seg({ x: 60, y: 300 }, { x: 540, y: 300 })];
        expect(quadsFromSegments(parallel, W, H)).toEqual([]);
    });

    it('ignore les droites trop proches pour être deux côtés opposés', () => {
        const thin = [
            seg({ x: 100, y: 100 }, { x: 500, y: 100 }), seg({ x: 100, y: 108 }, { x: 500, y: 108 }),
            seg({ x: 100, y: 100 }, { x: 100, y: 400 }), seg({ x: 500, y: 100 }, { x: 500, y: 400 }),
        ];
        // Les deux « horizontales » sont à 8 px l'une de l'autre : fusionnées en une seule droite
        expect(quadsFromSegments(thin, W, H)).toEqual([]);
    });
});
