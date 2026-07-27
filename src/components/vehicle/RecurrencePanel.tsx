'use client';

import React, { useMemo } from 'react';
import styles from './RecurrencePanel.module.css';

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const DAY_LABELS_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export interface RecurrenceFormState {
    enabled: boolean;
    daysOfWeek: number[];      // 0=Dim, 1=Lun, ... 6=Sam
    startHour: string;         // "HH:mm"
    endHour: string;           // "HH:mm"
    firstOccurrenceDate: string; // "YYYY-MM-DD"
    recurrenceEndDate: string;   // "YYYY-MM-DD"
}

interface RecurrencePanelProps {
    state: RecurrenceFormState;
    onChange: (state: RecurrenceFormState) => void;
}

/** Computes how many occurrences will be created */
function countOccurrences(state: RecurrenceFormState): number {
    if (!state.firstOccurrenceDate || !state.recurrenceEndDate || state.daysOfWeek.length === 0) return 0;
    const start = new Date(`${state.firstOccurrenceDate}T00:00:00`);
    const end = new Date(`${state.recurrenceEndDate}T23:59:59`);
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
        if (state.daysOfWeek.includes(current.getDay())) count++;
        current.setDate(current.getDate() + 1);
    }
    return count;
}

export default function RecurrencePanel({ state, onChange }: RecurrencePanelProps) {
    // Max date = today + 6 months
    const maxEndDate = useMemo(() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 6);
        return d.toISOString().split('T')[0];
    }, []);

    const minStartDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    }, []);

    const occurrenceCount = useMemo(() => countOccurrences(state), [state]);

    const humanSummary = useMemo(() => {
        if (state.daysOfWeek.length === 0 || !state.startHour || !state.endHour || !state.firstOccurrenceDate || !state.recurrenceEndDate) {
            return null;
        }
        const dayNames = state.daysOfWeek
            .sort((a, b) => a - b)
            .map(d => DAY_LABELS_FULL[d])
            .join(', ');
        const endDateFormatted = new Date(`${state.recurrenceEndDate}T12:00:00`).toLocaleDateString('fr-FR', {
            day: '2-digit', month: 'long', year: 'numeric',
        });
        return `Tous les ${dayNames} de ${state.startHour} à ${state.endHour} jusqu'au ${endDateFormatted}`;
    }, [state]);

    const toggleDay = (day: number) => {
        const next = state.daysOfWeek.includes(day)
            ? state.daysOfWeek.filter(d => d !== day)
            : [...state.daysOfWeek, day];
        onChange({ ...state, daysOfWeek: next });
    };

    return (
        <div className={styles.panel}>
            <div className={styles.panelHeader}>
                <span className={styles.panelIcon}>🔁</span>
                <span className={styles.panelTitle}>Paramètres de récurrence</span>
            </div>

            {/* Jours de la semaine */}
            <div className={styles.field}>
                <label className={styles.label}>Jours de répétition</label>
                <div className={styles.daysGrid}>
                    {DAY_LABELS.map((label, idx) => (
                        <button
                            key={idx}
                            type="button"
                            className={`${styles.dayBtn} ${state.daysOfWeek.includes(idx) ? styles.dayBtnActive : ''}`}
                            onClick={() => toggleDay(idx)}
                            aria-pressed={state.daysOfWeek.includes(idx)}
                            aria-label={DAY_LABELS_FULL[idx]}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Plage horaire */}
            <div className={styles.row}>
                <div className={styles.field}>
                    <label className={styles.label}>Heure de début</label>
                    <input
                        type="time"
                        className="form-input"
                        value={state.startHour}
                        onChange={e => onChange({ ...state, startHour: e.target.value })}
                        required
                    />
                </div>
                <div className={styles.field}>
                    <label className={styles.label}>Heure de fin</label>
                    <input
                        type="time"
                        className="form-input"
                        value={state.endHour}
                        onChange={e => onChange({ ...state, endHour: e.target.value })}
                        required
                    />
                </div>
            </div>

            {/* Période */}
            <div className={styles.row}>
                <div className={styles.field}>
                    <label className={styles.label}>À partir du</label>
                    <input
                        type="date"
                        className="form-input"
                        value={state.firstOccurrenceDate}
                        min={minStartDate}
                        max={maxEndDate}
                        onChange={e => onChange({ ...state, firstOccurrenceDate: e.target.value })}
                        required
                    />
                </div>
                <div className={styles.field}>
                    <label className={styles.label}>Jusqu&apos;au <span className={styles.maxHint}>(max 6 mois)</span></label>
                    <input
                        type="date"
                        className="form-input"
                        value={state.recurrenceEndDate}
                        min={state.firstOccurrenceDate || minStartDate}
                        max={maxEndDate}
                        onChange={e => onChange({ ...state, recurrenceEndDate: e.target.value })}
                        required
                    />
                </div>
            </div>

            {/* Résumé humain */}
            {humanSummary && (
                <div className={styles.summary}>
                    <span className={styles.summaryIcon}>📅</span>
                    <div>
                        <div className={styles.summaryText}>{humanSummary}</div>
                        {occurrenceCount > 0 && (
                            <div className={styles.summaryCount}>
                                {occurrenceCount} occurrence{occurrenceCount > 1 ? 's' : ''} seront créées
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
