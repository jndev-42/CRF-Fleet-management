import { describe, it, expect } from 'vitest';
import { presidentAppearanceLayout, type Box } from '@/lib/expenses/signature-layout';

// Dimensions réelles de l'apparence : widget président × 4 px par point.
const W = 666;
const H = 352;

const disjoint = (a: Box, b: Box) =>
    a.left + a.width <= b.left || b.left + b.width <= a.left
    || a.top + a.height <= b.top || b.top + b.height <= a.top;
const inside = (a: Box) => a.left >= 0 && a.top >= 0 && a.left + a.width <= W && a.top + a.height <= H;

describe('presidentAppearanceLayout', () => {
    it.each([
        ['rond', 200, 200],
        ['large (2:1)', 400, 200],
        ['très large (4:1)', 400, 100],
        ['haut (1:2)', 100, 200],
    ])('tampon %s : tampon et signature disjoints, dans le cadre', (_nom, w, h) => {
        const { stamp, signature } = presidentAppearanceLayout(W, H, { width: w, height: h });
        expect(disjoint(stamp, signature)).toBe(true);
        expect(inside(stamp)).toBe(true);
        expect(inside(signature)).toBe(true);
        // La signature garde une place lisible.
        expect(signature.width * signature.height).toBeGreaterThan(W * H * 0.25);
    });

    it('un tampon rond se place à gauche de la signature', () => {
        const { stamp, signature } = presidentAppearanceLayout(W, H, { width: 200, height: 200 });
        expect(stamp.left).toBe(0);
        expect(signature.left).toBeGreaterThanOrEqual(stamp.left + stamp.width);
    });

    it('un tampon très large passe au-dessus de la signature', () => {
        const { stamp, signature } = presidentAppearanceLayout(W, H, { width: 400, height: 100 });
        expect(signature.top).toBeGreaterThanOrEqual(stamp.top + stamp.height);
    });
});
