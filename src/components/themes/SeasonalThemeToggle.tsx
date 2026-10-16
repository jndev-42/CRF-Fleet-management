'use client';

import { Grape, TreePine, type LucideIcon } from 'lucide-react';
import { useSeasonalTheme } from '@/lib/contexts/SeasonalThemeContext';
import styles from './SeasonalThemeToggle.module.css';

interface ThemeIcon {
    Icon: LucideIcon;
    /** Couleur de l'icône quand le thème est affiché. */
    onClass: string;
}

/** Icône propre à chaque thème du catalogue ; la grappe sert de valeur par défaut. */
const THEME_ICONS: Record<string, ThemeIcon> = {
    noel: { Icon: TreePine, onClass: styles.onNoel },
};
const DEFAULT_ICON: ThemeIcon = { Icon: Grape, onClass: styles.on };

/** Icône compacte (navbar) pour masquer/afficher le thème saisonnier. Absente sans thème actif. */
export default function SeasonalThemeToggle() {
    const { theme, hidden, toggleHidden } = useSeasonalTheme();

    if (!theme) return null;

    const { Icon, onClass } = THEME_ICONS[theme] ?? DEFAULT_ICON;

    return (
        <button
            type="button"
            onClick={toggleHidden}
            className={`btn btn-secondary ${styles.toggle}`}
            aria-pressed={!hidden}
            aria-label={hidden ? 'Afficher le thème' : 'Masquer le thème'}
            title={hidden ? 'Afficher le thème' : 'Masquer le thème'}
        >
            <Icon size={20} className={hidden ? styles.off : onClass} />
        </button>
    );
}
