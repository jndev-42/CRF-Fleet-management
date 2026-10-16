import { describe, it, expect } from 'vitest';
import type { Quad } from '@/lib/documentScanner/geometry';
import {
    LOST_AFTER,
    QuadTracker,
    SWITCH_COUNT,
    isReadyToCapture,
    type TrackResult,
} from '@/lib/documentScanner/quadTracker';

const W = 640;
const H = 480; // diagonale 800 px : 1 % = 8 px, 8 % = 64 px
const TICK = 125;

const SHEET: Quad = [{ x: 100, y: 60 }, { x: 540, y: 70 }, { x: 560, y: 420 }, { x: 90, y: 410 }];
/** Bloc de texte à l'intérieur de la feuille : autre candidat plausible, loin du contour suivi. */
const TEXT_BLOCK: Quad = [{ x: 150, y: 120 }, { x: 480, y: 125 }, { x: 490, y: 300 }, { x: 140, y: 295 }];

const shift = (quad: Quad, dx: number, dy: number): Quad => quad.map((p) => ({ x: p.x + dx, y: p.y + dy })) as Quad;

/** Tick i de l'horloge simulée (125 ms par analyse). */
const at = (tick: number) => tick * TICK;

function track(tracker: QuadTracker, detection: Quad | null, tick: number): TrackResult {
    return tracker.update(detection, W, H, at(tick));
}

describe('documentScanner/quadTracker', () => {
    it('adopte immédiatement la première détection', () => {
        const tracker = new QuadTracker();
        const result = track(tracker, SHEET, 1);
        expect(result.quad).toEqual(SHEET);
        expect(result.hit).toBe(true);
    });

    it('zone morte : un tremblement de ±0,5 % ne change pas le contour affiché', () => {
        const tracker = new QuadTracker();
        track(tracker, SHEET, 1);
        const jitter = [4, -4, 3, -3, 4, -2, 2, -4]; // ±0,5 % de la diagonale (4 px)
        jitter.forEach((d, i) => {
            const result = track(tracker, shift(SHEET, d, -d), i + 2);
            expect(result.quad).toEqual(SHEET);
        });
    });

    it('lisse un déplacement lent au-delà de la zone morte', () => {
        const tracker = new QuadTracker();
        track(tracker, SHEET, 1);
        const moved = shift(SHEET, 30, 0); // 3,75 % : compatible mais hors zone morte
        const result = track(tracker, moved, 2);
        expect(result.quad![0].x).toBeGreaterThan(SHEET[0].x);
        expect(result.quad![0].x).toBeLessThan(moved[0].x);
    });

    it('alternance feuille / bloc de texte une image sur deux : reste sur la feuille', () => {
        const tracker = new QuadTracker();
        track(tracker, SHEET, 1);
        for (let tick = 2; tick < 40; tick++) {
            const result = track(tracker, tick % 2 === 0 ? TEXT_BLOCK : SHEET, tick);
            expect(result.quad).toEqual(SHEET);
        }
    });

    it('vrai déplacement : suit le nouveau contour après 3 détections cohérentes', () => {
        const tracker = new QuadTracker();
        track(tracker, SHEET, 1);
        const elsewhere = shift(SHEET, 120, 40); // bien au-delà de 8 %
        for (let i = 0; i < SWITCH_COUNT - 1; i++) {
            expect(track(tracker, elsewhere, 2 + i).quad).toEqual(SHEET);
        }
        const result = track(tracker, elsewhere, 2 + SWITCH_COUNT - 1);
        expect(result.quad).toEqual(elsewhere);
        expect(result.hit).toBe(true);
    });

    it('des détections éloignées mais incohérentes entre elles ne font pas changer de contour', () => {
        const tracker = new QuadTracker();
        track(tracker, SHEET, 1);
        const candidates = [shift(SHEET, 120, 40), shift(SHEET, -150, 30), shift(SHEET, 60, -120)];
        candidates.forEach((candidate, i) => {
            expect(track(tracker, candidate, 2 + i).quad).toEqual(SHEET);
        });
    });

    it('4 analyses ratées : contour conservé ; 6 : effacé', () => {
        const tracker = new QuadTracker();
        track(tracker, SHEET, 1);
        for (let i = 0; i < LOST_AFTER - 1; i++) {
            expect(track(tracker, null, 2 + i).quad).toEqual(SHEET);
        }
        expect(track(tracker, null, 2 + LOST_AFTER - 1).quad).toBeNull();
        expect(track(tracker, null, 2 + LOST_AFTER).quad).toBeNull();
    });

    it('une détection compatible remet à zéro le compte des ratés', () => {
        const tracker = new QuadTracker();
        track(tracker, SHEET, 1);
        for (let round = 0; round < 5; round++) {
            for (let i = 0; i < LOST_AFTER - 1; i++) track(tracker, null, 2 + round * 10 + i);
            expect(track(tracker, SHEET, 2 + round * 10 + 8).quad).toEqual(SHEET);
        }
    });

    it('après une perte, la détection suivante est adoptée immédiatement', () => {
        const tracker = new QuadTracker();
        track(tracker, SHEET, 1);
        for (let i = 0; i < LOST_AFTER; i++) track(tracker, null, 2 + i);
        const result = track(tracker, TEXT_BLOCK, 20);
        expect(result.quad).toEqual(TEXT_BLOCK);
    });

    describe('capture auto', () => {
        it('prête après 1 s de détections stables consécutives', () => {
            const tracker = new QuadTracker();
            let ready = -1;
            for (let tick = 1; tick <= 20 && ready < 0; tick++) {
                if (isReadyToCapture(track(tracker, SHEET, tick))) ready = tick;
            }
            expect(at(ready) - at(1)).toBe(1000);
        });

        it('jamais prête sur une analyse ratée, même si le délai est écoulé', () => {
            const tracker = new QuadTracker();
            for (let tick = 1; tick <= 8; tick++) track(tracker, SHEET, tick); // t = 125 … 1000
            const miss = track(tracker, null, 9); // t = 1125 : le délai est écoulé
            expect(miss.stableMs).toBeGreaterThanOrEqual(1000);
            expect(isReadyToCapture(miss)).toBe(false);
            expect(isReadyToCapture(track(tracker, SHEET, 10))).toBe(true);
        });

        it('ratés intercalés : pas de capture plus tôt qu\'avec des détections consécutives', () => {
            const consecutive = new QuadTracker();
            const alternating = new QuadTracker();
            let readyConsecutive = -1;
            let readyAlternating = -1;
            for (let tick = 1; tick <= 40; tick++) {
                if (readyConsecutive < 0 && isReadyToCapture(track(consecutive, SHEET, tick))) readyConsecutive = tick;
                const result = track(alternating, tick % 2 === 1 ? SHEET : null, tick);
                if (readyAlternating < 0 && isReadyToCapture(result)) {
                    readyAlternating = tick;
                    expect(tick % 2).toBe(1); // jamais sur un raté
                }
            }
            expect(readyAlternating).toBeGreaterThanOrEqual(readyConsecutive);
        });

        it('exige un minimum de vraies détections, pas seulement du temps écoulé', () => {
            const tracker = new QuadTracker();
            // Une détection toutes les 600 ms : 1 200 ms écoulées mais seulement 3 détections
            const results = [0, 4, 9].map((tick) => track(tracker, SHEET, tick + 1));
            const last = results[results.length - 1];
            expect(last.stableMs).toBeGreaterThanOrEqual(1000);
            expect(last.stableHits).toBe(3);
            expect(isReadyToCapture(last)).toBe(false);
        });

        it('un déplacement perceptible relance la série de stabilité', () => {
            const tracker = new QuadTracker();
            for (let tick = 1; tick <= 6; tick++) track(tracker, SHEET, tick);
            const moved = track(tracker, shift(SHEET, 40, 0), 7); // 5 % : compatible mais pas « stable »
            expect(moved.hit).toBe(true);
            expect(moved.stableMs).toBe(0);
            expect(moved.stableHits).toBe(1);
        });

        it('resetStability repart de zéro', () => {
            const tracker = new QuadTracker();
            for (let tick = 1; tick <= 10; tick++) track(tracker, SHEET, tick);
            tracker.resetStability();
            const result = track(tracker, SHEET, 11);
            expect(result.stableHits).toBe(1);
            expect(result.stableMs).toBe(0);
            expect(isReadyToCapture(result)).toBe(false);
        });
    });
});
