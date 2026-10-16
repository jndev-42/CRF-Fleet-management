'use client';

import { Ghost, Grape, Sparkles, type LucideIcon } from 'lucide-react';
import { useSeasonalTheme } from '@/lib/contexts/SeasonalThemeContext';
import styles from './SeasonalThemeToggle.module.css';

/** Icône et teinte du bouton propres à chaque thème du catalogue. */
const THEME_ICONS: Record<string, { Icon: LucideIcon; className: string }> = {
    'vendanges-montmartre': { Icon: Grape, className: styles.vendanges },
    halloween: { Icon: Ghost, className: styles.halloween },
};

/** Thème sans icône dédiée : pictogramme neutre. */
const FALLBACK = { Icon: Sparkles, className: styles.fallback };

/** Icône compacte (navbar) pour masquer/afficher le thème saisonnier. Absente sans thème actif. */
export default function SeasonalThemeToggle() {
    const { theme, hidden, toggleHidden } = useSeasonalTheme();

    if (!theme) return null;

    const { Icon, className } = THEME_ICONS[theme] ?? FALLBACK;

    return (
        <button
            type="button"
            onClick={toggleHidden}
            className={`btn btn-secondary ${styles.toggle}`}
            aria-pressed={!hidden}
            aria-label={hidden ? 'Afficher le thème' : 'Masquer le thème'}
            title={hidden ? 'Afficher le thème' : 'Masquer le thème'}
        >
            <Icon size={20} className={hidden ? styles.off : className} />
        </button>
    );
}
