'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import { useElementWidth, useGuidePageRender, useGuidePdf } from './useGuidePdf';
import styles from './VehicleGuideReader.module.css';

interface VehicleGuideReaderProps {
    /** URL de lecture du guide (`inline`). Le téléchargement ajoute `?download=1`. */
    src: string;
    fileName: string;
    onClose: () => void;
}

/** Distance horizontale minimale (px) pour qu'un glissé tourne la page. */
const SWIPE_THRESHOLD = 50;

/**
 * Liseuse plein écran du guide de vérification : une page à la fois, ajustée à
 * la largeur. Navigation par boutons, flèches du clavier ou glissé sur mobile ;
 * fermeture par bouton ou Échap.
 */
export default function VehicleGuideReader({ src, fileName, onClose }: VehicleGuideReaderProps) {
    useEscapeKey(onClose);

    const viewportRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const touchStart = useRef<{ x: number; y: number } | null>(null);
    const [pageNumber, setPageNumber] = useState(1);

    const { doc, error, setError } = useGuidePdf(src);
    const width = useElementWidth(viewportRef);
    useGuidePageRender(doc, pageNumber, width, canvasRef, setError);

    const pageCount = doc?.numPages ?? 0;
    const goPrev = useCallback(() => setPageNumber(p => Math.max(1, p - 1)), []);
    const goNext = useCallback(() => setPageNumber(p => Math.min(Math.max(pageCount, 1), p + 1)), [pageCount]);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'ArrowLeft') goPrev();
            else if (e.key === 'ArrowRight') goNext();
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [goPrev, goNext]);

    // Focus sur « Fermer » à l'ouverture ; la page dessous ne défile plus.
    useEffect(() => {
        closeRef.current?.focus();
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, []);

    function handleTouchStart(e: React.TouchEvent) {
        // Un pincement (plusieurs doigts) ou une page zoomée se manipule, ne se tourne pas.
        const zoomed = (window.visualViewport?.scale ?? 1) > 1;
        const touch = e.touches[0];
        touchStart.current = e.touches.length > 1 || zoomed || !touch
            ? null
            : { x: touch.clientX, y: touch.clientY };
    }

    function handleTouchEnd(e: React.TouchEvent) {
        const start = touchStart.current;
        touchStart.current = null;
        const end = e.changedTouches[0];
        if (!start || !end) return;
        const dx = end.clientX - start.x;
        const dy = end.clientY - start.y;
        // Un geste plutôt vertical (ou diagonal) est un défilement.
        if (Math.abs(dy) >= Math.abs(dx)) return;
        if (dx > SWIPE_THRESHOLD) goPrev();
        else if (-dx > SWIPE_THRESHOLD) goNext();
    }

    const downloadHref = `${src}${src.includes('?') ? '&' : '?'}download=1`;

    // Portail sur <body> : un ancêtre transformé ferait de `position: fixed` un
    // positionnement relatif à lui, et la liseuse ne couvrirait plus l'écran.
    return createPortal(
        <div role="dialog" aria-modal="true" aria-label={`Guide de vérification : ${fileName}`} className={styles.overlay}>
            <div className={styles.bar}>
                <div className={styles.title}>{fileName}</div>
                <a href={downloadHref} download={fileName} aria-label="Télécharger le guide" className={styles.iconButton}>
                    <Download size={20} />
                </a>
                <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer" className={styles.iconButton}>
                    <X size={22} />
                </button>
            </div>

            <div
                ref={viewportRef}
                className={styles.viewport}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                {error && <div role="alert" className={styles.message}>{error}</div>}
                {!error && !doc && <div role="status" aria-live="polite" className={styles.message}>Chargement du guide…</div>}
                <canvas
                    ref={canvasRef}
                    className={styles.canvas}
                    aria-label={doc ? `Page ${pageNumber} sur ${pageCount}` : undefined}
                    hidden={!doc || !!error}
                />
            </div>

            <div className={styles.footer}>
                <button type="button" onClick={goPrev} disabled={!doc || pageNumber <= 1} aria-label="Page précédente" className={styles.iconButton}>
                    <ChevronLeft size={22} />
                </button>
                <span aria-live="polite" className={styles.counter}>
                    {doc ? `${pageNumber} / ${pageCount}` : '– / –'}
                </span>
                <button type="button" onClick={goNext} disabled={!doc || pageNumber >= pageCount} aria-label="Page suivante" className={styles.iconButton}>
                    <ChevronRight size={22} />
                </button>
            </div>
        </div>,
        document.body,
    );
}
