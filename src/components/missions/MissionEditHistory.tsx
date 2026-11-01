'use client';

import { ArrowRight } from 'lucide-react';
import styles from './MissionEditHistory.module.css';

export interface MissionEditChange {
    field: string;
    label: string;
    old: string;
    new: string;
}

export interface MissionEdit {
    id: string;
    edited_at: string;
    editor_name: string;
    changes: MissionEditChange[];
}

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
});

/** Date et heure de Paris, ex. « 15/03/2026 à 14:05 ». */
export function formatEditDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return DATE_TIME.format(date).replace(' ', ' à ');
}

/**
 * Historique des modifications d'un compte rendu, du plus récent au plus ancien
 * (ordre fourni par l'API). Lecture seule : les entrées ne se modifient ni ne
 * se suppriment.
 */
export default function MissionEditHistory({ edits }: { edits: MissionEdit[] }) {
    return (
        <ol className={styles.list} aria-label="Historique des modifications">
            {edits.map(edit => (
                <li key={edit.id} className={`card ${styles.entry}`}>
                    <p className={styles.header}>
                        <strong>{edit.editor_name}</strong>
                        <span className={styles.date}>
                            <time dateTime={edit.edited_at}>{formatEditDate(edit.edited_at)}</time>
                        </span>
                    </p>
                    {edit.changes.length > 0 ? (
                        <dl className={styles.changes}>
                            {edit.changes.map(change => (
                                <div key={change.field} className={styles.change}>
                                    <dt>{change.label}</dt>
                                    <dd>
                                        <span className={styles.oldValue}>{change.old}</span>
                                        <ArrowRight size={14} aria-label="devient" className={styles.arrow} />
                                        <span className={styles.newValue}>{change.new}</span>
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <p className={styles.empty}>Détail indisponible.</p>
                    )}
                </li>
            ))}
        </ol>
    );
}
