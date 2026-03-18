'use client';

import { InventoryKPIs, InventoryItem } from '@/app/inventory/types';
import styles from './InventoryDashboard.module.css';

interface InventoryDashboardProps {
    kpis: InventoryKPIs;
    pharmaAlerts: InventoryItem[];
}

export default function InventoryDashboard({ kpis, pharmaAlerts }: InventoryDashboardProps) {
    return (
        <div>
            {pharmaAlerts.length > 0 && (
                <div className={styles.alertBanner} role="alert">
                    <span className={styles.alertIcon}>⚠️</span>
                    <span>
                        <strong>{pharmaAlerts.length} article{pharmaAlerts.length > 1 ? 's' : ''}</strong> en dessous du seuil critique à la Pharmacie Tampon :&nbsp;
                        {pharmaAlerts.map(a => a.itemName).join(', ')}
                    </span>
                </div>
            )}
            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiValue} style={{ color: kpis.expiringSoon > 0 ? 'var(--status-maintenance)' : 'var(--status-available)' }}>
                        {kpis.expiringSoon}
                    </div>
                    <div className={styles.kpiLabel}>Péremptions &lt; 30 jours</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiValue} style={{ color: kpis.horsService > 0 ? 'var(--status-maintenance)' : 'var(--status-available)' }}>
                        {kpis.horsService}
                    </div>
                    <div className={styles.kpiLabel}>Hors service</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiValue} style={{ color: kpis.pharmaAlerts > 0 ? 'var(--status-inuse)' : 'var(--status-available)' }}>
                        {kpis.pharmaAlerts}
                    </div>
                    <div className={styles.kpiLabel}>Alertes Tampon</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiValue} style={{ color: kpis.fleetCompleteness >= 75 ? 'var(--status-available)' : 'var(--status-inuse)' }}>
                        {kpis.fleetCompleteness}%
                    </div>
                    <div className={styles.kpiLabel}>Complétude flotte</div>
                </div>
            </div>
        </div>
    );
}
