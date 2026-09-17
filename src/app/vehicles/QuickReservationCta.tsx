'use client';

import Link from 'next/link';
import type { ReservationCtaState } from '@/lib/vehicleReservationEligibility';
import styles from './QuickBorrow.module.css';

interface QuickReservationCtaProps {
    state: ReservationCtaState;
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
 * CTA de réservation rapide, présentationnelle : ne calcule rien, ne fetch rien.
 * Miroir de `QuickBorrowCta` — quatre états : chargement, nominal, aucun véhicule
 * éligible, papiers bloqués.
 */
export default function QuickReservationCta({ state, message, eligibleCount, onOpen }: QuickReservationCtaProps) {
    const disabled = state !== 'NOMINAL';

    return (
        <div className={styles.ctaRow}>
            <button
                type="button"
                className={`btn btn-secondary btn-lg ${styles.ctaButton}`}
                onClick={onOpen}
                disabled={disabled}
                aria-label="Réserver un véhicule"
            >
                {state === 'LOADING'
                    ? '📅 Réserver…'
                    : `📅 Réserver (${eligibleCount} véhicule${eligibleCount > 1 ? 's' : ''})`}
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
