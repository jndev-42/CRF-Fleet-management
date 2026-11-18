'use client';

import { useEffect, useRef, type FocusEvent } from 'react';
import styles from './overview.module.css';

interface Props {
    message: string;
    onUndo: () => void;
    /** Survol ou focus : le décompte s'interrompt. */
    onPause: () => void;
    /** Fin du survol, ou le focus quitte le message : le décompte reprend. */
    onResume: () => void;
}

/**
 * Message « Annuler » après avoir coché une tâche. Le focus est porté sur « Annuler » à
 * son apparition (la ligne cochée disparaît) ; ce focus automatique n'interrompt pas le
 * décompte, contrairement au survol ou à un focus donné ensuite par l'utilisateur.
 */
export default function UndoToast({ message, onUndo, onPause, onResume }: Props) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const autoFocusing = useRef(false);

    useEffect(() => {
        autoFocusing.current = true;
        buttonRef.current?.focus();
        autoFocusing.current = false;
    }, []);

    const handleFocus = () => {
        if (!autoFocusing.current) onPause();
    };
    const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onResume();
    };

    return (
        <div role="status" className={styles.toast}
            onMouseEnter={onPause} onMouseLeave={onResume} onFocus={handleFocus} onBlur={handleBlur}>
            <span>{message}</span>
            <button ref={buttonRef} type="button" className={styles.toastButton} onClick={onUndo}>Annuler</button>
        </div>
    );
}
