'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { detectQuad, type OpenCv } from '@/lib/documentScanner/opencv';
import { fullFrameQuad, isStable, type Quad } from '@/lib/documentScanner/geometry';

export type CameraStatus = 'starting' | 'live' | 'denied' | 'unavailable';

export interface Capture {
    canvas: HTMLCanvasElement;
    quad: Quad;
}

const DETECTION_INTERVAL_MS = 125; // ~8 analyses/s
const STABLE_DELAY_MS = 1000;

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

        const id = window.setInterval(() => {
            const video = videoRef.current;
            if (busy || !video || !video.videoWidth) return;
            busy = true;
            try {
                const detected = detectQuad(cv, video);
                quadRef.current = detected;
                setQuad(detected);

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
        return { canvas, quad: quadRef.current ?? fullFrameQuad(canvas.width, canvas.height) };
    }, []);

    return { videoRef, status, videoSize, quad, capture, stop };
}
