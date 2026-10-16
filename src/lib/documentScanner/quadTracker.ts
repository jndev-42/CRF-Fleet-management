import { STABLE_TOLERANCE, blendQuads, distance, type Quad } from './geometry';

/** Un coin de la détection à moins de cette fraction de la diagonale du contour suivi : « compatible ». */
export const ATTACH_TOLERANCE = 0.08;
/** En deçà (par coin), le contour affiché ne bouge pas : supprime le tremblement. */
export const DEAD_ZONE = 0.01;
/** Poids de la nouvelle détection dans la moyenne mobile, au-delà de la zone morte. */
export const SMOOTHING_ALPHA = 0.3;
/** Détections éloignées, cohérentes entre elles, nécessaires pour abandonner le contour suivi. */
export const SWITCH_COUNT = 3;
/** Analyses consécutives sans détection compatible avant d'effacer le contour suivi. */
export const LOST_AFTER = 5;
export const STABLE_DELAY_MS = 1000;
/** Vraies détections stables minimales avant capture auto (les images ratées ne comptent pas). */
export const MIN_STABLE_HITS = 4;

export interface TrackResult {
    /** Contour à afficher (null = rien de suivi). */
    quad: Quad | null;
    /** Vrai si cette analyse a produit une détection compatible (ou adopté un nouveau contour). */
    hit: boolean;
    /** Durée depuis le début de la série de détections stables. */
    stableMs: number;
    /** Nombre de vraies détections stables dans la série. */
    stableHits: number;
}

function maxCornerDistance(a: Quad, b: Quad): number {
    return Math.max(...a.map((p, i) => distance(p, b[i])));
}

/** Capture auto autorisée : une vraie détection, stable depuis assez longtemps et assez souvent. */
export function isReadyToCapture(result: TrackResult, delayMs = STABLE_DELAY_MS, minHits = MIN_STABLE_HITS): boolean {
    return result.hit && result.stableMs >= delayMs && result.stableHits >= minHits;
}

/**
 * Suivi du contour du document entre les analyses (pur : ni DOM ni OpenCV).
 * Accrochage avec hystérésis, zone morte anti-tremblement, lissage, tolérance aux pertes.
 */
export class QuadTracker {
    private tracked: Quad | null = null;
    private pending: Quad | null = null;
    private pendingCount = 0;
    private misses = 0;
    private stableSince: number | null = null;
    private stableHits = 0;

    get quad(): Quad | null {
        return this.tracked;
    }

    /** Repart de zéro pour la série de stabilité (après une capture, par exemple). */
    resetStability(): void {
        this.stableSince = null;
        this.stableHits = 0;
    }

    update(detection: Quad | null, frameWidth: number, frameHeight: number, now: number): TrackResult {
        const diagonal = Math.hypot(frameWidth, frameHeight);
        const within = (a: Quad, b: Quad, fraction: number) => maxCornerDistance(a, b) <= diagonal * fraction;
        let hit = false;

        if (!this.tracked) {
            if (detection) {
                this.adopt(detection, now);
                hit = true;
            }
        } else if (detection && within(this.tracked, detection, ATTACH_TOLERANCE)) {
            hit = true;
            this.misses = 0;
            this.pending = null;
            this.pendingCount = 0;
            const steady = within(this.tracked, detection, STABLE_TOLERANCE);
            if (!within(this.tracked, detection, DEAD_ZONE)) {
                this.tracked = blendQuads(this.tracked, detection, SMOOTHING_ALPHA);
            }
            if (steady) {
                this.stableSince ??= now;
                this.stableHits += 1;
            } else {
                this.stableSince = now;
                this.stableHits = 1;
            }
        } else {
            this.misses += 1;
            if (detection) {
                // Détection éloignée : on ne change de contour qu'après plusieurs détections cohérentes entre elles
                const coherent = this.pending !== null && within(this.pending, detection, ATTACH_TOLERANCE);
                this.pendingCount = coherent ? this.pendingCount + 1 : 1;
                this.pending = detection;
                if (this.pendingCount >= SWITCH_COUNT) {
                    this.adopt(detection, now);
                    hit = true;
                }
            }
            if (this.misses >= LOST_AFTER) this.clear();
        }

        return {
            quad: this.tracked,
            hit,
            stableMs: this.stableSince === null ? 0 : now - this.stableSince,
            stableHits: this.stableHits,
        };
    }

    private adopt(quad: Quad, now: number): void {
        this.tracked = quad;
        this.pending = null;
        this.pendingCount = 0;
        this.misses = 0;
        this.stableSince = now;
        this.stableHits = 1;
    }

    private clear(): void {
        this.tracked = null;
        this.pending = null;
        this.pendingCount = 0;
        this.misses = 0;
        this.stableSince = null;
        this.stableHits = 0;
    }
}
