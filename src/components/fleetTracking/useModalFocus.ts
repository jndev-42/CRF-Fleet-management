'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modale accessible : focus placé dans la modale à l'ouverture (sur l'élément
 * `[data-autofocus]`, à défaut le premier focusable), Tab piégé à
 * l'intérieur, Échap ferme, focus rendu à l'élément d'origine à la fermeture.
 */
export function useModalFocus<T extends HTMLElement>(onClose: () => void) {
    const ref = useRef<T>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const root = ref.current;
        (root?.querySelector<HTMLElement>('[data-autofocus]') ?? root?.querySelector<HTMLElement>(FOCUSABLE))?.focus();

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCloseRef.current();
                return;
            }
            if (e.key !== 'Tab' || !root) return;
            const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            previous?.focus?.();
        };
    }, []);

    return ref;
}
