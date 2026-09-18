'use client';

import {
    INTERVENTION_MODE_CATEGORIES,
    INTERVENTION_NATURE_CATEGORIES,
    INTERVENTION_MODE_LABELS,
    INTERVENTION_NATURE_LABELS,
} from '@/lib/mission-interventions';
import styles from '../MissionWizard.module.css';

interface StepInterventionBreakdownProps {
    /** Total à répartir — `MissionFormData.victim_count`. */
    victimCount: number;
    /** Répartition par type de prise en charge, clé = catégorie. */
    interventionTypes: Record<string, number>;
    /** Répartition par nature clinique, clé = catégorie. */
    interventionNatures: Record<string, number>;
    onTypeChange: (category: string, qty: number) => void;
    onNatureChange: (category: string, qty: number) => void;
}

const sum = (values: Record<string, number>, categories: readonly string[]) =>
    categories.reduce((acc, cat) => acc + (values[cat] ?? 0), 0);

/** Une grille de 5 champs nombre, avec son compteur « courant / cible ». */
function BreakdownGroup({
    title,
    categories,
    labels,
    values,
    total,
    onChange,
}: {
    title: string;
    categories: readonly string[];
    labels: Record<string, string>;
    values: Record<string, number>;
    total: number;
    onChange: (category: string, qty: number) => void;
}) {
    const current = sum(values, categories);
    const isComplete = current === total;

    return (
        <div className={styles.accordion}>
            <div className={styles.accordionHeader} style={{ cursor: 'default' }}>
                <span className={styles.accordionTitle}>{title}</span>
                <span
                    className={styles.accordionBadge}
                    style={isComplete ? undefined : { background: 'var(--text-secondary)' }}
                    aria-label={`${title} : ${current} sur ${total}`}
                >
                    {current} / {total}
                </span>
            </div>
            <div className={styles.accordionBody}>
                <div className={styles.itemGrid}>
                    {categories.map(cat => {
                        const inputId = `intervention_${cat}`;
                        return (
                            <div key={cat} className={styles.supplyItem}>
                                <label className={styles.supplyLabel} htmlFor={inputId}>{labels[cat] ?? cat}</label>
                                <input
                                    id={inputId}
                                    type="number"
                                    className={styles.supplyInput}
                                    min={0}
                                    value={values[cat] ?? 0}
                                    onChange={e => {
                                        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                        e.target.value = String(val);
                                        onChange(cat, val);
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function StepInterventionBreakdown({
    victimCount,
    interventionTypes,
    interventionNatures,
    onTypeChange,
    onNatureChange,
}: StepInterventionBreakdownProps) {
    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Répartition des interventions</h2>
            <p className={styles.stepSubtitle}>
                Répartissez les {victimCount} intervention{victimCount > 1 ? 's' : ''} dans les deux grilles.
                Chaque grille doit totaliser exactement {victimCount}.
            </p>

            <BreakdownGroup
                title="Par type de prise en charge"
                categories={INTERVENTION_MODE_CATEGORIES}
                labels={INTERVENTION_MODE_LABELS}
                values={interventionTypes}
                total={victimCount}
                onChange={onTypeChange}
            />

            <BreakdownGroup
                title="Par nature de l'intervention"
                categories={INTERVENTION_NATURE_CATEGORIES}
                labels={INTERVENTION_NATURE_LABELS}
                values={interventionNatures}
                total={victimCount}
                onChange={onNatureChange}
            />
        </div>
    );
}
