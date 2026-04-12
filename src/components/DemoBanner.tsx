'use client';

import { useDemoMode } from '@/lib/contexts/DemoContext';
import { DemoDB } from '@/lib/demo/DemoDB';
import styles from './DemoBanner.module.css';

export default function DemoBanner() {
    const { isDemoMode, toggleDemoMode } = useDemoMode();

    if (!isDemoMode) return null;

    const handleReset = () => {
        if (window.confirm("Réinitialiser toutes les données du mode démo ?")) {
            DemoDB.reset();
            window.location.reload();
        }
    };

    return (
        <div className={styles.banner} role="alert">
            <span className={styles.icon} aria-hidden="true">🛠️</span>
            <span className={styles.text}>
                <span className={styles.strong}>Mode Démo Actif.</span>{' '}
                Données fictives stockées localement.
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    type="button"
                    className={styles.btnQuit}
                    style={{ background: 'rgba(0,0,0,0.1)', color: '#000', border: '1px solid rgba(0,0,0,0.2)' }}
                    onClick={handleReset}
                >
                    Réinitialiser
                </button>
                <button
                    type="button"
                    className={styles.btnQuit}
                    onClick={toggleDemoMode}
                >
                    Quitter le mode démo
                </button>
            </div>
        </div>
    );
}
