'use client';

import styles from './QuickBorrow.module.css';

interface FleetStatsRowProps {
    stats: {
        total: number;
        available: number;
        inUse: number;
        maintenance: number;
    };
}

/**
 * Les quatre compteurs de flotte, rétrogradés en ligne compacte sous la CTA.
 * Porte l'ancrage `data-tour="stats"` du tour guidé, unique dans le DOM.
 */
export default function FleetStatsRow({ stats }: FleetStatsRowProps) {
    return (
        <div className={styles.statsRow} data-tour="stats">
            <div className={styles.stat}>
                <span className={styles.statValue}>{stats.total}</span>
                <span className={styles.statLabel}>Total</span>
            </div>
            <div className={`${styles.stat} ${styles.available}`}>
                <span className={styles.statValue}>{stats.available}</span>
                <span className={styles.statLabel}>Disponibles</span>
            </div>
            <div className={`${styles.stat} ${styles.inuse}`}>
                <span className={styles.statValue}>{stats.inUse}</span>
                <span className={styles.statLabel}>En mission</span>
            </div>
            <div className={`${styles.stat} ${styles.maintenance}`}>
                <span className={styles.statValue}>{stats.maintenance}</span>
                <span className={styles.statLabel}>Maintenance</span>
            </div>
        </div>
    );
}
