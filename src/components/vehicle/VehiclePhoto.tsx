'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import styles from './VehiclePhoto.module.css';

interface VehiclePhotoProps {
    /** URL versionnée de la photo (cf. `vehiclePhotoUrl`). */
    src: string;
    vehicleName: string;
}

/**
 * Vignette de la photo d'un véhicule ; un clic l'agrandit en plein écran.
 * Si l'image ne se charge pas, le composant disparaît sans laisser d'emplacement vide.
 */
export default function VehiclePhoto({ src, vehicleName }: VehiclePhotoProps) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    // Mémorise l'URL en échec, et non un booléen : une nouvelle photo retente le chargement.
    const [failedSrc, setFailedSrc] = useState<string | null>(null);

    const close = useCallback(() => {
        setOpen(false);
        triggerRef.current?.focus();
    }, []);

    function handleError() {
        setOpen(false);
        setFailedSrc(src);
    }

    if (failedSrc === src) return null;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={styles.thumbnail}
                onClick={() => setOpen(true)}
                aria-label={`Agrandir la photo du véhicule ${vehicleName}`}
            >
                {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par l'API */}
                <img loading="lazy" decoding="async" src={src} alt="" onError={handleError} />
            </button>
            {open && <PhotoLightbox src={src} vehicleName={vehicleName} onClose={close} onError={handleError} />}
        </>
    );
}

interface PhotoLightboxProps extends VehiclePhotoProps {
    onClose: () => void;
    onError: () => void;
}

function PhotoLightbox({ src, vehicleName, onClose, onError }: PhotoLightboxProps) {
    useEscapeKey(onClose);
    const closeRef = useRef<HTMLButtonElement>(null);

    // Focus sur « Fermer » à l'ouverture ; la page dessous ne défile plus.
    useEffect(() => {
        closeRef.current?.focus();
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, []);

    // Portail sur <body> : un ancêtre transformé ferait de `position: fixed` un
    // positionnement relatif à lui, et l'image ne couvrirait plus l'écran.
    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`Photo du véhicule ${vehicleName}`}
            className={styles.overlay}
            onClick={onClose}
        >
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer" className={styles.close}>
                <X size={22} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par l'API */}
            <img
                src={src}
                alt={`Véhicule ${vehicleName}`}
                className={styles.image}
                onClick={e => e.stopPropagation()}
                onError={onError}
            />
        </div>,
        document.body,
    );
}
