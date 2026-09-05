'use client';

import Link from 'next/link';
import type { BorrowCtaState } from '@/lib/vehicleBorrowEligibility';
import styles from './QuickBorrow.module.css';

interface QuickBorrowCtaProps {
    state: BorrowCtaState;
    /** Libellé français figé du refus. Jamais vide hors `LOADING` / `NOMINAL`. */
    message: string;
    eligibleCount: number;
    onOpen: () => void;
}

/** Fait défiler jusqu'au planning déjà rendu plus bas sur la page, sans navigation. */
function scrollToCalendar() {
    document
        .querySelector('[data-testid="vehicle-calendar"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * CTA d'emprunt rapide, présentationnelle : ne calcule rien, ne fetch rien.
 * Quatre états — chargement, nominal, aucun véhicule éligible, papiers bloqués.
 */
export default function QuickBorrowCta({ state, message, eligibleCount, onOpen }: QuickBorrowCtaProps) {
    const disabled = state !== 'NOMINAL';

    return (
        <div className={styles.ctaRow}>
            <button
                type="button"
                className={`btn btn-primary btn-lg ${styles.ctaButton}`}
                onClick={onOpen}
                disabled={disabled}
                aria-label="Emprunter un véhicule"
            >
                {state === 'LOADING'
                    ? '🚗 Emprunter…'
                    : `🚗 Emprunter (${eligibleCount} dispo)`}
            </button>

            {state === 'NONE_ELIGIBLE' && (
                <p className={styles.message} role="status">
                    {message}
                    <br />
                    <button type="button" className={styles.linkButton} onClick={scrollToCalendar}>
                        Voir le calendrier
                    </button>
                </p>
            )}

            {state === 'LICENSE_BLOCKED' && (
                <p className={styles.message} role="status">
                    {message}
                    <br />
                    <Link href="/aide" className={styles.link}>
                        Régulariser mes papiers
                    </Link>
                </p>
            )}
        </div>
    );
}
