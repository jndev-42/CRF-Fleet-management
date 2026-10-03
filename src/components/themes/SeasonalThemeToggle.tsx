'use client';

import { Grape } from 'lucide-react';
import { useSeasonalTheme } from '@/lib/contexts/SeasonalThemeContext';
import styles from './SeasonalThemeToggle.module.css';

/** Icône compacte (navbar) pour masquer/afficher le thème saisonnier. Absente sans thème actif. */
export default function SeasonalThemeToggle() {
    const { theme, hidden, toggleHidden } = useSeasonalTheme();

    if (!theme) return null;

    return (
        <button
            type="button"
            onClick={toggleHidden}
            className={`btn btn-secondary ${styles.toggle}`}
            aria-pressed={!hidden}
            aria-label={hidden ? 'Afficher le thème' : 'Masquer le thème'}
            title={hidden ? 'Afficher le thème' : 'Masquer le thème'}
        >
            <Grape size={20} className={hidden ? styles.off : styles.on} />
        </button>
    );
}
