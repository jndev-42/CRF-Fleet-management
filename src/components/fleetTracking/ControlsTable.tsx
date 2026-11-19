'use client';

import {
    CONTROL_STATE_LABELS,
    CONTROL_TYPE_LABELS,
    dueLabel,
    formatControlDay,
    type ControlRow,
} from '@/lib/fleetTracking/controls';
import styles from './controls.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    rows: ControlRow[];
    onEdit: (row: ControlRow) => void;
}

/** Rendez-vous : « 28/11/2026 · Garage » ; passé : « RDV passé le 10/11/2026 ». */
function appointmentText(row: ControlRow): string | null {
    const a = row.appointment;
    if (!a) return null;
    const day = formatControlDay(a.appointmentDate);
    if (row.appointmentPast) return `RDV passé le ${day}`;
    return a.contactName ? `${day} · ${a.contactName}` : day;
}

function dueTone(row: ControlRow): string {
    if (row.daysUntilDue < 0) return styles.due_OVERDUE;
    return row.soon ? styles.due_SOON : '';
}

/** Tableau des échéances (cartes empilées sur mobile). */
export default function ControlsTable({ rows, onEdit }: Props) {
    return (
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">Véhicule</th>
                        <th scope="col">Contrôle</th>
                        <th scope="col">Échéance</th>
                        <th scope="col">Rendez-vous</th>
                        <th scope="col">État</th>
                        <th scope="col"><span className={taskStyles.srOnly}>Action</span></th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const rdv = appointmentText(row);
                        const scheduled = row.state === 'SCHEDULED';
                        return (
                            <tr key={row.key} data-testid={`control-${row.key}`}>
                                <td data-label="Véhicule">
                                    <span className={styles.vehicle}>
                                        <span className={taskStyles.pill}>{row.vehicle.name}</span>
                                        {row.vehicle.plate && <span className={styles.muted}>{row.vehicle.plate}</span>}
                                    </span>
                                </td>
                                <td data-label="Contrôle">{CONTROL_TYPE_LABELS[row.controlType]}</td>
                                <td data-label="Échéance">
                                    <span className={styles.dueValue}>
                                        <span className={dueTone(row)}>{dueLabel(row)}</span>
                                        {row.remainingKm !== null && (
                                            <span className={styles.muted}><span className={styles.dueSep}> · </span>{row.remainingKm.toLocaleString('fr-FR')} km restants</span>
                                        )}
                                    </span>
                                </td>
                                <td data-label="Rendez-vous">
                                    {rdv ? <span className={row.appointmentPast ? styles.muted : undefined}>{rdv}</span> : <span className={styles.muted}>—</span>}
                                </td>
                                <td data-label="État">
                                    <span className={`${styles.state} ${styles[`state_${row.state}`]}`}>{CONTROL_STATE_LABELS[row.state]}</span>
                                </td>
                                <td className={styles.actionCell}>
                                    <button
                                        type="button"
                                        className={`btn btn-sm ${row.state === 'OVERDUE' ? 'btn-primary' : 'btn-secondary'}`}
                                        aria-label={`${scheduled ? 'Modifier le rendez-vous' : 'Fixer un rendez-vous'} : ${CONTROL_TYPE_LABELS[row.controlType]} du ${row.vehicle.name}`}
                                        onClick={() => onEdit(row)}
                                    >
                                        {scheduled ? 'Modifier' : 'Fixer un RDV'}
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
