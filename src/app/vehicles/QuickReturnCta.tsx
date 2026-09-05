'use client';

import type { DashboardVehicle } from './types';
import styles from './QuickBorrow.module.css';

interface QuickReturnCtaProps {
    /** Véhicules que l'utilisateur a en cours d'emprunt. Jamais vide : la section
     *  ne rend pas la CTA quand la liste est vide. */
    vehicles: DashboardVehicle[];
    /** Hydratation du véhicule en cours : la CTA est inerte le temps du fetch. */
    pending: boolean;
    onOpen: () => void;
}

/**
 * CTA de retour rapide, présentationnelle : ne calcule rien, ne fetch rien.
 * Un seul véhicule → le libellé le nomme et le clic ouvre directement le retour ;
 * plusieurs → le libellé annonce le compte et le clic ouvre le sélecteur.
 */
export default function QuickReturnCta({ vehicles, pending, onOpen }: QuickReturnCtaProps) {
    const isSingle = vehicles.length === 1;
    const label = isSingle
        ? `↩️ Rendre ${vehicles[0].name}`
        : `↩️ Rendre un véhicule (${vehicles.length})`;
    const ariaLabel = isSingle
        ? `Rendre le véhicule ${vehicles[0].name}`
        : `Rendre un véhicule (${vehicles.length} en cours d'emprunt)`;

    return (
        <button
            type="button"
            className={`btn btn-secondary btn-lg ${styles.ctaButton}`}
            onClick={onOpen}
            disabled={pending}
            aria-label={ariaLabel}
        >
            {label}
        </button>
    );
}
