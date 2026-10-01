'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { BookOpen } from 'lucide-react';
import { isQrBlocked } from '@/lib/roles';
import ReferentielChatPanel from './ReferentielChatPanel';
import styles from './ReferentielChatButton.module.css';

/**
 * Bouton flottant du chatbot du référentiel secourisme, au-dessus du bouton
 * « Signaler un bug ». Réservé aux comptes actifs (jamais INACTIF).
 */
export default function ReferentielChatButton() {
    const { data: session, status } = useSession();
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const wasOpen = useRef(false);

    // Le bouton est démonté pendant que le panneau est ouvert : à la fermeture, le focus
    // retombait sur <body>. On le rend au bouton une fois remonté.
    useEffect(() => {
        if (open) wasOpen.current = true;
        else if (wasOpen.current) {
            wasOpen.current = false;
            buttonRef.current?.focus();
        }
    }, [open]);

    if (status !== 'authenticated') return null;
    if (isQrBlocked((session?.user?.roles || []) as string[])) return null;

    return (
        <>
            {!open && (
                <button
                    ref={buttonRef}
                    type="button"
                    className={styles.floatingButton}
                    onClick={() => setOpen(true)}
                    aria-label="Interroger le référentiel secourisme"
                    title="Interroger le référentiel secourisme"
                >
                    <BookOpen size={20} />
                </button>
            )}
            {open && <ReferentielChatPanel onClose={() => setOpen(false)} />}
        </>
    );
}
