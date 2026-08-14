import { useEffect } from 'react';

/**
 * Closes the active modal when the user presses Escape.
 * Pass `enabled = false` for modals that stay mounted but hidden
 * (e.g. an `isOpen` prop gating a `return null`) so Escape doesn't
 * fire while the modal isn't actually visible.
 */
export function useEscapeKey(onClose: () => void, enabled: boolean = true) {
    useEffect(() => {
        if (!enabled) return;
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, enabled]);
}
