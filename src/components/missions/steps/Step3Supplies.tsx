'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SUPPLIES_BY_CATEGORY, type SupplyCategory } from '@/lib/mission-supplies';
import styles from '../MissionWizard.module.css';

const STEP3_CATEGORIES: SupplyCategory[] = ['SAC_PRIMAIRE', 'BRULURE', 'HEMORRHAGIE', 'KIT_DSA', 'HYGIENE'];

interface Step3Props {
    supplies: Record<string, number>;
    onSupplyChange: (key: string, qty: number) => void;
}

export default function Step3Supplies({ supplies, onSupplyChange }: Step3Props) {
    const [openCategories, setOpenCategories] = useState<Set<SupplyCategory>>(new Set(['SAC_PRIMAIRE']));

    function toggleCategory(cat: SupplyCategory) {
        setOpenCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    }

    function getCategoryTotal(cat: SupplyCategory): number {
        return SUPPLIES_BY_CATEGORY[cat].items.reduce((sum, item) => {
            const key = `${cat}__${item.name}`;
            return sum + (supplies[key] ?? 0);
        }, 0);
    }

    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Matériel utilisé et non réassorti</h2>
            <p className={styles.stepSubtitle}>Indiquez les quantités consommées (laissez à 0 si non utilisé).</p>

            {STEP3_CATEGORIES.map(cat => {
                const def = SUPPLIES_BY_CATEGORY[cat];
                const isOpen = openCategories.has(cat);
                const total = getCategoryTotal(cat);

                return (
                    <div key={cat} className={styles.accordion}>
                        <button
                            type="button"
                            className={styles.accordionHeader}
                            onClick={() => toggleCategory(cat)}
                            aria-expanded={isOpen}
                        >
                            <span className={styles.accordionTitle}>
                                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                {def.label}
                            </span>
                            {total > 0 && (
                                <span className={styles.accordionBadge}>{total} unité{total > 1 ? 's' : ''}</span>
                            )}
                        </button>

                        {isOpen && (
                            <div className={styles.accordionBody}>
                                <div className={styles.itemGrid}>
                                    {def.items.map(item => {
                                        const key = `${cat}__${item.name}`;
                                        const qty = supplies[key] ?? 0;
                                        return (
                                            <div key={key} className={styles.supplyItem}>
                                                <label className={styles.supplyLabel}>{item.name}</label>
                                                <input
                                                    type="number"
                                                    className={styles.supplyInput}
                                                    min={0}
                                                    value={qty}
                                                    onChange={e => {
                                                        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                                        e.target.value = String(val);
                                                        onSupplyChange(key, val);
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
