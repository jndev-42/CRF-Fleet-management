'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import type { DtAvailabilityStatus, DtWindowResult } from '@/lib/dtAvailability';
import {
    DT_SHORTCUTS,
    DT_STATUS_META,
    dispoOptionsFor,
    dtShortcutRange,
    fromLocalInputValue,
    toLocalInputValue,
    type DtMode,
} from './dtFilters';
import styles from './DtFilterPanel.module.css';

type PeriodError = Extract<DtWindowResult, { ok: false }>;

interface DtFilterPanelProps {
    mode: DtMode;
    from: string | null;
    to: string | null;
    periodError: PeriodError | null;
    dispo: DtAvailabilityStatus[];
    /** `null` tant qu'aucun calcul n'est disponible (période invalide) : compteurs « — ». */
    dispoCounts: Record<DtAvailabilityStatus, number> | null;
    types: string[];
    typeOptions: { type: string; count: number }[];
    summary: string;
    busy: boolean;
    onModeChange: (mode: DtMode) => void;
    onPeriodChange: (from: Date, to: Date) => void;
    onToggleDispo: (status: DtAvailabilityStatus) => void;
    onToggleType: (type: string) => void;
    onReset: () => void;
    /** Instant de référence des raccourcis (injectable pour les tests). */
    now?: Date;
}

const MODES: { key: DtMode; label: string }[] = [
    { key: 'now', label: 'Maintenant' },
    { key: 'period', label: 'Période' },
];

const vehiclesLabel = (count: number | null) =>
    count === null ? 'nombre inconnu' : `${count} véhicule${count > 1 ? 's' : ''}`;

/**
 * Panneau de filtres de la Vue DT : temporalité (Maintenant / Période), puces Disponibilité
 * et Type à compteurs, synthèse annoncée. Composant contrôlé : l'état vit dans l'URL
 * (`useDtFilters`). Sous 640 px, il se replie derrière « Filtres · N actifs ».
 */
export default function DtFilterPanel(props: DtFilterPanelProps) {
    const { mode, from, to, periodError, dispo, dispoCounts, types, typeOptions, summary, busy } = props;
    const activeCount = (mode === 'period' ? 1 : 0) + dispo.length + types.length;
    const [open, setOpen] = useState(activeCount === 0);
    const radioRefs = useRef<Record<DtMode, HTMLButtonElement | null>>({ now: null, period: null });
    const now = props.now ?? new Date();

    function selectMode(next: DtMode, focus = false) {
        if (next !== mode) props.onModeChange(next);
        if (focus) radioRefs.current[next]?.focus();
    }

    function onRadioKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        selectMode(mode === 'now' ? 'period' : 'now', true);
    }

    function onStartChange(value: string) {
        const start = fromLocalInputValue(value);
        if (!start) return;
        const prevFrom = from ? new Date(from) : null;
        const prevTo = to ? new Date(to) : null;
        let end = prevTo ?? new Date(start.getTime() + 12 * 60 * 60 * 1000);
        // Un début placé après la fin décale la fin en conservant la durée précédente.
        if (end.getTime() <= start.getTime()) {
            const duration = prevFrom && prevTo && prevTo > prevFrom ? prevTo.getTime() - prevFrom.getTime() : 12 * 60 * 60 * 1000;
            end = new Date(start.getTime() + duration);
        }
        props.onPeriodChange(start, end);
    }

    function onEndChange(value: string) {
        const end = fromLocalInputValue(value);
        if (!end) return;
        props.onPeriodChange(from ? new Date(from) : now, end);
    }

    function reset() {
        props.onReset();
        radioRefs.current.now?.focus();
    }

    const errorId = 'dt-period-error';

    return (
        <section className={`card ${styles.panel}`} aria-label="Filtres de la Vue DT">
            <button
                type="button"
                className={styles.disclosure}
                aria-expanded={open}
                aria-controls="dt-filter-body"
                onClick={() => setOpen((o) => !o)}
            >
                Filtres · {activeCount} actif{activeCount > 1 ? 's' : ''}
                <span aria-hidden="true">{open ? '▴' : '▾'}</span>
            </button>

            <div id="dt-filter-body" className={`${styles.body} ${open ? '' : styles.collapsed}`}>
                <div className={styles.group}>
                    <span className={styles.groupLabel}>Quand ?</span>
                    <div role="radiogroup" aria-label="Quand" className={styles.segmented}>
                        {MODES.map((m) => (
                            <button
                                key={m.key}
                                ref={(el) => { radioRefs.current[m.key] = el; }}
                                type="button"
                                role="radio"
                                aria-checked={mode === m.key}
                                tabIndex={mode === m.key ? 0 : -1}
                                className={`${styles.segment} ${mode === m.key ? styles.segmentActive : ''}`}
                                onClick={() => selectMode(m.key)}
                                onKeyDown={onRadioKeyDown}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {mode === 'period' && (
                    <div className={styles.period}>
                        <div className={styles.fields}>
                            <div className={styles.field}>
                                <label htmlFor="dt-debut" className="form-label">Début</label>
                                <input
                                    id="dt-debut"
                                    type="datetime-local"
                                    step={60}
                                    className="form-input"
                                    value={toLocalInputValue(from)}
                                    onChange={(e) => onStartChange(e.target.value)}
                                />
                            </div>
                            <div className={styles.field}>
                                <label htmlFor="dt-fin" className="form-label">Fin</label>
                                <input
                                    id="dt-fin"
                                    type="datetime-local"
                                    step={60}
                                    className="form-input"
                                    value={toLocalInputValue(to)}
                                    onChange={(e) => onEndChange(e.target.value)}
                                    aria-invalid={periodError ? true : undefined}
                                    aria-describedby={periodError ? errorId : undefined}
                                />
                            </div>
                        </div>
                        <div className={styles.shortcuts} role="group" aria-label="Raccourcis de période">
                            {DT_SHORTCUTS.map((s) => {
                                const range = dtShortcutRange(s.key, now);
                                const active = toLocalInputValue(range.from.toISOString()) === toLocalInputValue(from)
                                    && toLocalInputValue(range.to.toISOString()) === toLocalInputValue(to);
                                return (
                                    <button
                                        key={s.key}
                                        type="button"
                                        className={`filter-btn ${active ? 'active' : ''}`}
                                        aria-pressed={active}
                                        onClick={() => props.onPeriodChange(range.from, range.to)}
                                    >
                                        {s.label}
                                    </button>
                                );
                            })}
                        </div>
                        {periodError && (
                            <p id={errorId} className={styles.error} role="alert">
                                {periodError.error}
                                {periodError.code === 'PAST' && (
                                    <>
                                        {' '}
                                        <button type="button" className={styles.linkButton} onClick={() => selectMode('now', true)}>
                                            Revenir à Maintenant
                                        </button>
                                    </>
                                )}
                            </p>
                        )}
                    </div>
                )}

                <fieldset className={styles.chips}>
                    <legend className={styles.groupLabel}>Disponibilité</legend>
                    {dispoOptionsFor(mode).map((status) => {
                        const meta = DT_STATUS_META[status];
                        const count = dispoCounts ? dispoCounts[status] : null;
                        const active = dispo.includes(status);
                        return (
                            <button
                                key={status}
                                type="button"
                                className={`filter-btn ${styles.chip} ${active ? 'active' : ''}`}
                                aria-pressed={active}
                                aria-label={`${meta.chip}, ${vehiclesLabel(count)}`}
                                onClick={() => props.onToggleDispo(status)}
                            >
                                <span aria-hidden="true">{meta.icon}</span> {meta.chip}
                                <span className={`${styles.count} ${count === 0 ? styles.countZero : ''}`}>{count ?? '—'}</span>
                            </button>
                        );
                    })}
                </fieldset>

                <fieldset className={styles.chips}>
                    <legend className={styles.groupLabel}>Type de véhicule</legend>
                    {typeOptions.map(({ type, count: rawCount }) => {
                        const count = dispoCounts ? rawCount : null;
                        const active = types.includes(type);
                        return (
                            <button
                                key={type}
                                type="button"
                                className={`filter-btn ${styles.chip} ${active ? 'active' : ''}`}
                                aria-pressed={active}
                                aria-label={`${type}, ${vehiclesLabel(count)}`}
                                onClick={() => props.onToggleType(type)}
                            >
                                {type}
                                <span className={`${styles.count} ${count === 0 ? styles.countZero : ''}`}>{count ?? '—'}</span>
                            </button>
                        );
                    })}
                </fieldset>

                {activeCount > 0 && (
                    <button type="button" className={styles.linkButton} onClick={reset}>
                        Réinitialiser les filtres
                    </button>
                )}
            </div>

            <p className={styles.summary} aria-live="polite">
                {busy ? 'Mise à jour…' : summary}
            </p>
        </section>
    );
}
