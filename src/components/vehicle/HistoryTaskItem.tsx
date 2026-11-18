'use client';

import { CheckCircle2, ListTodo } from 'lucide-react';
import { formatFrDate, TASK_STATUS_LABELS, type FleetTask } from '@/lib/fleetTracking/tasks';
import styles from '@/components/fleetTracking/dossiers.module.css';

interface Props {
    task: FleetTask;
    onOpen: () => void;
}

/** Tâche hors dossier dans l'historique technique d'un véhicule. */
export default function HistoryTaskItem({ task, onOpen }: Props) {
    const done = task.status === 'DONE';
    const contacts = task.links.filter(l => l.type === 'CONTACT' && !l.missing).map(l => l.label);
    const meta = [
        done && task.completedAt ? `Terminée le ${formatFrDate(task.completedAt)}` : `Créée le ${formatFrDate(task.createdAt)}`,
        ...contacts,
        task.attachmentCount > 0 ? `${task.attachmentCount} pièce${task.attachmentCount > 1 ? 's' : ''} jointe${task.attachmentCount > 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(' · ');
    return (
        <li className={styles.row}>
            <span className={`${styles.status} ${done ? styles.status_DONE : styles.status_ACTIVE}`}>{TASK_STATUS_LABELS[task.status]}</span>
            {done ? <CheckCircle2 size={18} aria-hidden="true" className={styles.rowIcon} /> : <ListTodo size={18} aria-hidden="true" className={styles.rowIcon} />}
            <div className={styles.rowMain}>
                <div className={styles.rowTitle}>{task.title}</div>
                <div className={styles.rowMeta}>{meta}</div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={onOpen} aria-label={`${done ? 'Consulter' : 'Ouvrir'} la tâche ${task.title}`}>
                {done ? 'Consulter' : 'Ouvrir'}
            </button>
        </li>
    );
}
