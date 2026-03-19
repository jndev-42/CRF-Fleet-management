'use client';

import { SUPPLIES_BY_CATEGORY } from '@/lib/mission-supplies';
import styles from '../MissionWizard.module.css';

interface Step4Props {
    supplies: Record<string, number>;
    onSupplyChange: (key: string, qty: number) => void;
}

export default function Step4Oxygen({ supplies, onSupplyChange }: Step4Props) {
    const def = SUPPLIES_BY_CATEGORY['OXYGENE'];

    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Matériel oxygène</h2>
            <p className={styles.stepSubtitle}>Indiquez les quantités consommées (laissez à 0 si non utilisé).</p>

            <div className={styles.itemGrid}>
                {def.items.map(item => {
                    const key = `OXYGENE__${item.name}`;
                    const qty = supplies[key] ?? 0;
                    return (
                        <div key={key} className={styles.supplyItem}>
                            <label className={styles.supplyLabel}>{item.name}</label>
                            <input
                                type="number"
                                className={styles.supplyInput}
                                min={0}
                                value={qty}
                                onChange={e => onSupplyChange(key, Math.max(0, parseInt(e.target.value, 10) || 0))}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
