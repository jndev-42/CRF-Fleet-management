'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Camera, CameraOff, Check, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { CAPTURE_ANALYSIS_SIZE, detectQuad, loadOpenCv, warpAndEnhance, type EnhanceMode, type OpenCv } from '@/lib/documentScanner/opencv';
import { MAX_SCAN_PAGES, pagesToPdfFile } from '@/lib/documentScanner/output';
import { isConvexQuad, isStable, type Quad } from '@/lib/documentScanner/geometry';
import { useScannerCamera } from './documentScanner/useScannerCamera';
import CornerAdjuster from './documentScanner/CornerAdjuster';
import styles from './DocumentScanner.module.css';

interface DocumentScannerProps {
    /** Reçoit le PDF final (toutes les pages scannées). */
    onComplete: (file: File) => void;
    onClose: () => void;
    /** Repli : l'appelant ouvre l'appareil photo natif. */
    onFallback: () => void;
}

type Phase = 'camera' | 'adjust' | 'review';

interface ScannedPage {
    canvas: HTMLCanvasElement;
    preview: string;
    thumb: string;
}

const MODES: ReadonlyArray<{ value: EnhanceMode; label: string }> = [
    { value: 'original', label: 'Original' },
    { value: 'color', label: 'Couleur' },
    { value: 'bw', label: 'Noir & blanc' },
];

const THUMB_MAX_SIDE = 120;
/** Écart maximal (fraction de la diagonale) entre contour en direct et détection fine pour adopter cette dernière. */
const REFINE_TOLERANCE = 0.1;

const canvasUrl = (c: HTMLCanvasElement, quality = 0.85) => c.toDataURL('image/jpeg', quality);

function thumbUrl(source: HTMLCanvasElement): string {
    const ratio = Math.min(1, THUMB_MAX_SIDE / Math.max(source.width, source.height, 1));
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(source.width * ratio));
    small.height = Math.max(1, Math.round(source.height * ratio));
    small.getContext('2d')?.drawImage(source, 0, 0, small.width, small.height);
    return canvasUrl(small, 0.6);
}

const nextFrame = () =>
    new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
        else setTimeout(resolve, 0);
    });

export default function DocumentScanner({ onComplete, onClose, onFallback }: DocumentScannerProps) {
    const [phase, setPhase] = useState<Phase>('camera');
    const [cv, setCv] = useState<OpenCv | null>(null);
    const [engineFailed, setEngineFailed] = useState(false);
    const [raw, setRaw] = useState<{ canvas: HTMLCanvasElement; url: string } | null>(null);
    const [quad, setQuad] = useState<Quad | null>(null);
    const [mode, setMode] = useState<EnhanceMode>('original');
    const [processed, setProcessed] = useState<ScannedPage | null>(null);
    const [pages, setPages] = useState<ScannedPage[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        loadOpenCv()
            .then((engine) => { if (!cancelled) setCv(engine); })
            .catch((e: unknown) => {
                console.error('Chargement du moteur de scan impossible', e);
                if (!cancelled) setEngineFailed(true);
            });
        return () => { cancelled = true; };
    }, []);

    const camera = useScannerCamera({ active: phase === 'camera' && !busy, cv, onStable: () => handleCapture() });
    const { stop: stopCamera } = camera;

    // Moteur indisponible : le flux caméra ne sert plus à rien derrière l'écran de repli
    useEffect(() => {
        if (engineFailed) stopCamera();
    }, [engineFailed, stopCamera]);

    // Retour Android / Échap ferment le scanner sans quitter l'assistant de mission
    const pushedRef = useRef(false);
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);
    useEffect(() => {
        window.history.pushState({ documentScanner: true }, '');
        pushedRef.current = true;
        const onPop = () => {
            if (!pushedRef.current) return;
            pushedRef.current = false;
            onCloseRef.current();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('popstate', onPop);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('popstate', onPop);
            window.removeEventListener('keydown', onKey);
            if (pushedRef.current) {
                pushedRef.current = false;
                window.history.back(); // retire l'entrée d'historique ajoutée à l'ouverture
            }
        };
    }, []);

    function handleClose() {
        if (pushedRef.current) {
            pushedRef.current = false;
            window.history.back();
        }
        onCloseRef.current();
    }

    function handleCapture() {
        const captured = camera.capture();
        if (!captured) return;
        setError(null);
        // Nouvelle détection sur l'image figée, en meilleure définition ; sinon contour en direct, sinon cadre plein
        let corners = captured.quad;
        if (cv) {
            try {
                const { width, height } = captured.canvas;
                // Le contour en direct sert de référence (même repère : pixels vidéo) pour retrouver le même document
                const refined = detectQuad(cv, captured.canvas, CAPTURE_ANALYSIS_SIZE, captured.detected ? captured.quad : null);
                // Le contour en direct est stable : la détection fine ne le remplace que si elle reste proche,
                // sans quoi elle a pu s'accrocher à un autre rectangle
                if (refined && (!captured.detected || isStable(captured.quad, refined, width, height, REFINE_TOLERANCE))) {
                    corners = refined;
                }
            } catch (e: unknown) {
                console.error('Détection sur la capture impossible', e);
            }
        }
        setRaw({ canvas: captured.canvas, url: canvasUrl(captured.canvas, 0.8) });
        setQuad(corners);
        setPhase('adjust');
    }

    const process = useCallback(async (source: HTMLCanvasElement, corners: Quad, enhance: EnhanceMode) => {
        if (!isConvexQuad(corners)) {
            setError('Les coins se croisent : ajustez-les');
            return;
        }
        setBusy(true);
        setError(null);
        await nextFrame(); // laisse afficher l'indicateur avant le traitement synchrone
        try {
            const engine = await loadOpenCv();
            const canvas = warpAndEnhance(engine, source, corners, enhance);
            setProcessed({ canvas, preview: canvasUrl(canvas, 0.85), thumb: thumbUrl(canvas) });
            setMode(enhance);
            setPhase('review');
        } catch (e: unknown) {
            console.error('Redressement du document impossible', e);
            setError('Le redressement du document a échoué. Ajustez les coins et réessayez.');
        } finally {
            setBusy(false);
        }
    }, []);

    const changeMode = (next: EnhanceMode) => {
        if (raw && quad) void process(raw.canvas, quad, next);
    };

    const retake = () => {
        setError(null);
        setProcessed(null);
        setRaw(null);
        setPhase('camera');
    };

    const addPage = () => {
        if (!processed) return;
        setPages((prev) => [...prev, processed]);
        retake();
    };

    const finish = async (extra: ScannedPage | null) => {
        const all = extra ? [...pages, extra] : pages;
        if (all.length === 0) return;
        setBusy(true);
        setError(null);
        try {
            onComplete(await pagesToPdfFile(all.map((p) => p.canvas)));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Impossible d'enregistrer le scan.");
            setBusy(false);
        }
    };

    const total = pages.length + (processed ? 1 : 0);
    const canAddPage = total < MAX_SCAN_PAGES;

    if (camera.status === 'denied' || camera.status === 'unavailable' || engineFailed) {
        const denied = camera.status === 'denied';
        return (
            <div className={styles.root} role="dialog" aria-modal="true" aria-label="Scanner de document">
                <div className={styles.fallback}>
                    <CameraOff size={40} />
                    <p className={styles.fallbackTitle}>
                        {denied ? 'Accès caméra refusé' : 'Le scanner n’est pas disponible'}
                    </p>
                    <p className={styles.fallbackText}>
                        {denied
                            ? 'Autorisez la caméra dans votre navigateur, ou utilisez l’appareil photo du téléphone.'
                            : 'Vous pouvez utiliser l’appareil photo du téléphone à la place.'}
                    </p>
                    <button type="button" className="btn btn-primary" onClick={onFallback}>
                        Utiliser l&apos;appareil photo du téléphone
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={handleClose}>Fermer</button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.root} role="dialog" aria-modal="true" aria-label="Scanner de document">
            <div className={styles.topBar}>
                <button type="button" className={styles.iconButton} onClick={handleClose} aria-label="Fermer le scanner">
                    <X size={22} />
                </button>
                <span className={styles.title}>
                    {phase === 'camera' && 'Cadrez le document'}
                    {phase === 'adjust' && 'Ajustez les coins'}
                    {phase === 'review' && 'Aperçu'}
                    {total > 0 && ` · ${total} page${total > 1 ? 's' : ''}`}
                </span>
            </div>

            <div className={styles.body}>
                <div className={phase === 'camera' ? styles.cameraView : styles.hidden}>
                    <div
                        className={styles.stage}
                        style={{ '--ratio': camera.videoSize ? camera.videoSize.width / camera.videoSize.height : 0.75 } as CSSProperties}
                    >
                        <video
                            ref={camera.videoRef}
                            className={styles.video}
                            playsInline
                            muted
                        />
                        {camera.quad && camera.videoSize && (
                            <svg
                                className={styles.overlay}
                                viewBox={`0 0 ${camera.videoSize.width} ${camera.videoSize.height}`}
                                preserveAspectRatio="none"
                                aria-hidden="true"
                            >
                                <polygon
                                    points={camera.quad.map((p) => `${p.x},${p.y}`).join(' ')}
                                    className={styles.outline}
                                    vectorEffect="non-scaling-stroke"
                                />
                            </svg>
                        )}
                    </div>
                    <p className={styles.hintText}>
                        {camera.status === 'starting' && 'Démarrage de la caméra…'}
                        {camera.status === 'live' && !cv && 'Chargement du scanner…'}
                        {camera.status === 'live' && cv && (camera.quad ? 'Document détecté, ne bougez plus' : 'Aucun bord détecté : cadrez ou déclenchez manuellement')}
                    </p>
                </div>

                {phase === 'adjust' && raw && quad && (
                    <CornerAdjuster
                        imageUrl={raw.url}
                        width={raw.canvas.width}
                        height={raw.canvas.height}
                        quad={quad}
                        onChange={setQuad}
                    />
                )}

                {phase === 'review' && processed && (
                    <div className={styles.reviewView}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (data URL) */}
                        <img
                            src={processed.preview}
                            alt="Document redressé"
                            className={styles.preview}
                            style={{ '--ratio': processed.canvas.width / processed.canvas.height } as CSSProperties}
                        />
                        <div className={styles.modeToggle} role="group" aria-label="Rendu">
                            {MODES.map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    className={mode === value ? styles.modeActive : styles.modeButton}
                                    aria-pressed={mode === value}
                                    onClick={() => changeMode(value)}
                                    disabled={busy}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {error && <div role="alert" className={styles.error}>{error}</div>}

            {pages.length > 0 && (
                <div className={styles.thumbs}>
                    {pages.map((p, i) => (
                        <div key={i} className={styles.thumb}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- vignette locale (data URL) */}
                            <img src={p.thumb} alt={`Page ${i + 1}`} />
                            <button
                                type="button"
                                className={styles.thumbRemove}
                                aria-label={`Supprimer la page ${i + 1}`}
                                onClick={() => setPages((prev) => prev.filter((_, k) => k !== i))}
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className={styles.actions}>
                {phase === 'camera' && (
                    <>
                        {pages.length > 0 ? (
                            <button type="button" className="btn btn-secondary" onClick={() => void finish(null)} disabled={busy}>
                                <Check size={16} /> Terminer
                            </button>
                        ) : <span />}
                        <button
                            type="button"
                            className={styles.shutter}
                            onClick={handleCapture}
                            disabled={camera.status !== 'live'}
                            aria-label="Prendre la photo"
                        >
                            <Camera size={26} />
                        </button>
                        <span />
                    </>
                )}
                {phase === 'adjust' && (
                    <>
                        <button type="button" className="btn btn-secondary" onClick={retake} disabled={busy}>
                            <RotateCcw size={16} /> Reprendre
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => raw && quad && void process(raw.canvas, quad, mode)}
                            disabled={busy}
                        >
                            {busy ? <Loader2 size={16} className={styles.spin} /> : <Check size={16} />} Valider
                        </button>
                    </>
                )}
                {phase === 'review' && (
                    <>
                        <button type="button" className="btn btn-secondary" onClick={retake} disabled={busy}>
                            <RotateCcw size={16} /> Reprendre
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={addPage} disabled={busy || !canAddPage}>
                            <Plus size={16} /> Ajouter une page
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => void finish(processed)} disabled={busy}>
                            {busy ? <Loader2 size={16} className={styles.spin} /> : <Check size={16} />} Terminer
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
