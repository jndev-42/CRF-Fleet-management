'use client';

import { useEffect, useRef, useState } from 'react';
import { useDemoMode } from '@/lib/contexts/DemoContext';
import { DEMO_SIMULATED_EVENT } from '@/lib/demo/readOnly';
import styles from './DemoBanner.module.css';

const NOTICE_DURATION_MS = 4000;

export default function DemoBanner() {
    const { isDemoMode, toggleDemoMode } = useDemoMode();
    const [notice, setNotice] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!isDemoMode) return;
        const onSimulated = () => {
            setNotice(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setNotice(false), NOTICE_DURATION_MS);
        };
        window.addEventListener(DEMO_SIMULATED_EVENT, onSimulated);
        return () => {
            window.removeEventListener(DEMO_SIMULATED_EVENT, onSimulated);
            if (timer.current) clearTimeout(timer.current);
        };
    }, [isDemoMode]);

    if (!isDemoMode) return null;

    return (
        <div className={styles.banner} role="alert">
            <span className={styles.icon} aria-hidden="true">🛠️</span>
            <span className={styles.text}>
                <span className={styles.strong}>Mode démo :</span>{' '}
                Base de démonstration partagée, remise à zéro chaque nuit à partir des vraies données. Vos actions sont réellement enregistrées dans la démo, jamais dans la base réelle.
            </span>
            {notice && (
                <span className={styles.notice} role="status">
                    Action simulée : fichiers, véhicules connectés et notifications ne sont pas envoyés en démo
                </span>
            )}
            <button type="button" className={styles.btnQuit} onClick={toggleDemoMode}>
                Quitter le mode démo
            </button>
        </div>
    );
}
