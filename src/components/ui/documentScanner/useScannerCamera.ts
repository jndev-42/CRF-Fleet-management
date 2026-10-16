'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { detectQuad, type OpenCv } from '@/lib/documentScanner/opencv';
import { blendQuads, fullFrameQuad, isStable, type Quad } from '@/lib/documentScanner/geometry';

export type CameraStatus = 'starting' | 'live' | 'denied' | 'unavailable';

export interface Capture {
    canvas: HTMLCanvasElement;
    quad: Quad;
    /** Vrai si `quad` vient d'une détection en direct (sinon : cadre plein par défaut). */
    detected: boolean;
}

const DETECTION_INTERVAL_MS = 125; // ~8 analyses/s
const STABLE_DELAY_MS = 1000;
/** Poids de la nouvelle détection dans la moyenne mobile exponentielle des coins. */
const SMOOTHING_ALPHA = 0.5;
/** Au-delà de ce déplacement (fraction de la diagonale), on ne lisse plus : on repart de la nouvelle détection. */
const JUMP_TOLERANCE = 0.1;
/** Analyses consécutives sans détection tolérées avant d'effacer le contour affiché. */
const MAX_MISSES = 3;

interface Options {
    /** Vrai tant que l'écran caméra est affiché : met la détection en route. */
    active: boolean;
    cv: OpenCv | null;
    onStable: () => void;
}

/** Gère le flux caméra arrière, la détection de contour en direct et la capture. */
export function useScannerCamera({ active, cv, onStable }: Options) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [status, setStatus] = useState<CameraStatus>('starting');
    const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
    const [quad, setQuad] = useState<Quad | null>(null);
    const quadRef = useRef<Quad | null>(null);
    const onStableRef = useRef(onStable);
    // Après une capture, la capture auto reste désarmée tant que le même document est devant la caméra
    const armedRef = useRef(true);
    const disarmedQuadRef = useRef<Quad | null>(null);

    useEffect(() => {
        onStableRef.current = onStable;
    }, [onStable]);

    const stop = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (!navigator.mediaDevices?.getUserMedia) {
            // Navigateur sans API caméra (ou contexte non sécurisé) : repli sur l'appareil photo natif
            Promise.resolve().then(() => {
                if (!cancelled) setStatus('unavailable');
            });
            return () => {
                cancelled = true;
            };
        }
        navigator.mediaDevices
            .getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            })
            .then((stream) => {
                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                const video = videoRef.current;
                if (video) {
                    video.srcObject = stream;
                    video.play()?.catch(() => undefined);
                }
                setStatus('live');
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                const name = e instanceof DOMException ? e.name : '';
                setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
            });
        return () => {
            cancelled = true;
            stop();
        };
    }, [stop]);

    // Suit la taille réelle de la vidéo (rotation de l'appareil comprise)
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const update = () => {
            if (video.videoWidth) setVideoSize({ width: video.videoWidth, height: video.videoHeight });
        };
        video.addEventListener('loadedmetadata', update);
        video.addEventListener('resize', update);
        return () => {
            video.removeEventListener('loadedmetadata', update);
            video.removeEventListener('resize', update);
        };
    }, []);

    // Pause la vidéo hors de l'écran caméra (économie de batterie)
    useEffect(() => {
        const video = videoRef.current;
        if (!video || status !== 'live') return;
        if (active) video.play()?.catch(() => undefined);
        else video.pause();
    }, [active, status]);

    // Boucle de détection
    useEffect(() => {
        if (!active || status !== 'live' || !cv) return;
        let busy = false;
        let previous: Quad | null = null;
        let stableSince: number | null = null;
        let smoothed: Quad | null = null;
        let misses = 0;

        const id = window.setInterval(() => {
            const video = videoRef.current;
            if (busy || !video || !video.videoWidth) return;
            busy = true;
            try {
                const raw = detectQuad(cv, video);
                if (raw) {
                    misses = 0;
                    // Lissage si la détection reste proche de la précédente ; sinon on repart de la nouvelle
                    smoothed = smoothed && isStable(smoothed, raw, video.videoWidth, video.videoHeight, JUMP_TOLERANCE)
                        ? blendQuads(smoothed, raw, SMOOTHING_ALPHA)
                        : raw;
                } else if (++misses >= MAX_MISSES) {
                    smoothed = null; // le document a vraiment disparu
                }
                const detected = smoothed;
                quadRef.current = detected;
                setQuad(detected);

                // Analyse ratée mais contour conservé : l'affichage tient, mais seule une vraie détection
                // fait avancer la stabilité (et déclenche la capture)
                if (!raw && detected) return;

                if (!armedRef.current) {
                    const moved = detected && disarmedQuadRef.current
                        && !isStable(disarmedQuadRef.current, detected, video.videoWidth, video.videoHeight);
                    if (!detected || moved) {
                        armedRef.current = true; // document retiré ou déplacé : on réarme
                    } else {
                        previous = null;
                        stableSince = null;
                        return;
                    }
                }

                const now = Date.now();
                if (detected && isStable(previous, detected, video.videoWidth, video.videoHeight)) {
                    stableSince ??= now;
                    if (now - stableSince >= STABLE_DELAY_MS) {
                        stableSince = null;
                        previous = null;
                        onStableRef.current();
                        return;
                    }
                } else {
                    stableSince = detected ? now : null;
                }
                previous = detected;
            } catch (e: unknown) {
                console.error('Détection du document impossible', e);
            } finally {
                busy = false;
            }
        }, DETECTION_INTERVAL_MS);

        return () => {
            window.clearInterval(id);
            quadRef.current = null;
            setQuad(null);
        };
    }, [active, status, cv]);

    /** Fige l'image courante ; coins par défaut = cadre entier si rien n'est détecté. */
    const capture = useCallback((): Capture | null => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return null;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        armedRef.current = false;
        disarmedQuadRef.current = quadRef.current;
        return {
            canvas,
            quad: quadRef.current ?? fullFrameQuad(canvas.width, canvas.height),
            detected: quadRef.current !== null,
        };
    }, []);

    return { videoRef, status, videoSize, quad, capture, stop };
}
