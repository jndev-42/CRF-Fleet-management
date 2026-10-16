import { describe, it, expect } from 'vitest';
import {
    blendQuads,
    clamp,
    estimateAspectRatio,
    fullFrameQuad,
    isConvexQuad,
    isStable,
    orderCorners,
    outputSize,
    polygonArea,
    quadArea,
    scaleQuad,
    snapToA4,
    type Quad,
} from '@/lib/documentScanner/geometry';

const FRAME_W = 1920;
const FRAME_H = 1080;
const FOCAL = 1500;
const DEG = Math.PI / 180;

const scaleRect = (w: number, h: number): Quad => [
    { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
];

/** Projette un rectangle w x h (plan Z=0, centré) avec une caméra à sténopé : focale 1500 px, point principal au centre. */
function project(w: number, h: number, pose: { tiltX: number; tiltY: number; roll: number }): Quad {
    const [ax, ay, az] = [pose.tiltX * DEG, pose.tiltY * DEG, pose.roll * DEG];
    const rotate = ([x, y, z]: number[]): number[] => {
        // Rx puis Ry puis Rz
        const [y1, z1] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
        const [x2, z2] = [x * Math.cos(ay) + z1 * Math.sin(ay), -x * Math.sin(ay) + z1 * Math.cos(ay)];
        const [x3, y3] = [x2 * Math.cos(az) - y1 * Math.sin(az), x2 * Math.sin(az) + y1 * Math.cos(az)];
        return [x3, y3, z2];
    };
    const distance = (FOCAL * Math.max(w, h)) / (FRAME_H * 0.55);
    return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as const).map(([x, y]) => {
        const [X, Y, Z] = rotate([x, y, 0]);
        return { x: FRAME_W / 2 + (FOCAL * X) / (Z + distance), y: FRAME_H / 2 + (FOCAL * Y) / (Z + distance) };
    }) as Quad;
}

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

    it('calcule la taille de sortie à partir des bords (vue frontale, rapport hors A4)', () => {
        const tall = scaleRect(100, 200);
        expect(outputSize(tall, 640, 480)).toEqual({ width: 100, height: 200 });
    });

    it('aimante sur le rapport A4 quand il est proche', () => {
        // 100 x 150 (rapport 0,667) est à moins de 10 % de l'A4 portrait
        expect(outputSize(rect, 640, 480)).toEqual({ width: 100, height: 141 });
        expect(snapToA4(0.7)).toBeCloseTo(1 / Math.SQRT2, 10);
        expect(snapToA4(1.35)).toBeCloseTo(Math.SQRT2, 10);
        expect(snapToA4(1)).toBe(1);
    });

    it('plafonne la taille de sortie à 2000 px en gardant le ratio', () => {
        const big = scaleRect(4000, 8000);
        expect(outputSize(big, 8000, 9000)).toEqual({ width: 1000, height: 2000 });
    });

    it('redresse un A4 incliné sans l\'écraser', () => {
        const quad = project(210, 297, { tiltX: 40, tiltY: 20, roll: 8 });
        const { width, height } = outputSize(quad, FRAME_W, FRAME_H);
        expect(width / height).toBeCloseTo(1 / Math.SQRT2, 2);
    });

    it('retrouve le rapport d\'un carré incliné (hors aimantation A4)', () => {
        const quad = project(300, 300, { tiltX: 35, tiltY: -25, roll: 5 });
        const { width, height } = outputSize(quad, FRAME_W, FRAME_H);
        expect(width / height).toBeCloseTo(1, 1);
    });

    describe('estimateAspectRatio', () => {
        const poses = [
            { tiltX: 25, tiltY: 0, roll: 0 },
            { tiltX: 0, tiltY: 30, roll: 12 },
            { tiltX: 35, tiltY: 20, roll: -15 },
            { tiltX: 40, tiltY: -25, roll: 30 },
            { tiltX: -20, tiltY: 35, roll: 90 },
        ];

        it.each([
            ['A4 portrait', 210, 297],
            ['rectangle 4:3', 400, 300],
        ])('retrouve le rapport réel (%s) à moins de 3 %% sous différentes inclinaisons', (_name, w, h) => {
            for (const pose of poses) {
                const ratio = estimateAspectRatio(project(w, h, pose), FRAME_W, FRAME_H);
                expect(ratio, JSON.stringify(pose)).not.toBeNull();
                expect(Math.abs((ratio as number) / (w / h) - 1)).toBeLessThan(0.03);
            }
        });

        it('retourne null pour une vue frontale (focale indéterminée)', () => {
            expect(estimateAspectRatio(project(210, 297, { tiltX: 0, tiltY: 0, roll: 0 }), FRAME_W, FRAME_H)).toBeNull();
            expect(estimateAspectRatio(project(210, 297, { tiltX: 0, tiltY: 0, roll: 15 }), FRAME_W, FRAME_H)).toBeNull();
            expect(estimateAspectRatio(rect, 640, 480)).toBeNull();
        });

        it('retourne null pour un quadrilatère dégénéré', () => {
            const flat = [0, 1, 2, 3].map(() => ({ x: 5, y: 5 })) as Quad;
            expect(estimateAspectRatio(flat, 640, 480)).toBeNull();
        });

        it('en vue frontale, outputSize retombe sur le rapport des bords', () => {
            expect(outputSize(scaleRect(300, 100), 640, 480)).toEqual({ width: 300, height: 100 });
        });
    });

    it('interpole deux quadrilatères (moyenne mobile)', () => {
        const next = rect.map((p) => ({ x: p.x + 10, y: p.y - 20 })) as Quad;
        const mid = blendQuads(rect, next, 0.5);
        expect(mid[0]).toEqual({ x: 15, y: 0 });
        expect(blendQuads(rect, next, 1)).toEqual(next);
        expect(blendQuads(rect, next, 0)).toEqual(rect);
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
