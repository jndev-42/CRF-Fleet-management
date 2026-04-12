'use client';

import { useDemoMode } from '@/lib/contexts/DemoContext';
import styles from './DemoBanner.module.css';

export default function DemoBanner() {
    const { isDemoMode, toggleDemoMode } = useDemoMode();

    if (!isDemoMode) return null;

    return (
        <div className={styles.banner} role="alert">
            <span className={styles.icon} aria-hidden="true">🛠️</span>
            <span className={styles.text}>
                <span className={styles.strong}>Mode Démo Actif.</span>{' '}
                Toutes vos actions sont simulées et ne modifient pas la base de données réelle.
            </span>
            <button
                type="button"
                className={styles.btnQuit}
                onClick={toggleDemoMode}
            >
                Quitter le mode démo
            </button>
        </div>
    );
}
