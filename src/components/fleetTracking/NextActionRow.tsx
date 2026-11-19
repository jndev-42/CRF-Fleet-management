'use client';

import { Paperclip, Pin } from 'lucide-react';
import { dueTone, formatDueDate, type FleetTask } from '@/lib/fleetTracking/tasks';
import styles from './overview.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    task: FleetTask;
    today: string;
    onComplete: (task: FleetTask) => void;
    onEdit: (task: FleetTask) => void;
}

/** Ligne « Prochaines actions » : case à cocher (→ Terminé), véhicules, assignés, échéance, « Modifier ». */
export default function NextActionRow({ task, today, onComplete, onEdit }: Props) {
    const tone = dueTone(task.dueDate, today);
    const vehicles = task.links.filter(l => l.type === 'VEHICLE' && !l.missing);
    const checkboxId = `next-action-${task.id}`;
    return (
        <li className={styles.action}>
            <input
                id={checkboxId}
                type="checkbox"
                className={styles.check}
                checked={false}
                onChange={() => onComplete(task)}
                aria-label={`Terminer « ${task.title} »`}
            />
            <div className={styles.actionBody}>
                <label htmlFor={checkboxId} className={styles.actionTitle}>
                    {task.title}
                    {task.pinned && <Pin size={14} className={taskStyles.pinIcon} aria-label="Épinglée" />}
                </label>
                <div className={taskStyles.pills}>
                    {vehicles.map(v => <span key={v.id} className={taskStyles.pill}>{v.label}</span>)}
                    {task.assignees.length > 0 && (
                        <span className={taskStyles.dim}>{task.assignees.map(a => a.name).join(', ')}</span>
                    )}
                    <span className={`${taskStyles.due}${tone ? ` ${taskStyles[`due_${tone}`]}` : ''}`}>
                        {task.dueDate ? `Échéance ${formatDueDate(task.dueDate)}` : 'Date à fixer'}
                    </span>
                    {task.priority === 'HIGH' && <span className={`${taskStyles.pill} ${taskStyles.pillHigh}`}>Prioritaire</span>}
                    {task.attachmentCount > 0 && (
                        <span className={taskStyles.dim} aria-label={task.attachmentCount > 1 ? `${task.attachmentCount} pièces jointes` : '1 pièce jointe'}>
                            <Paperclip size={12} aria-hidden="true" /> {task.attachmentCount}
                        </span>
                    )}
                </div>
            </div>
            <button type="button" className={`btn btn-secondary btn-sm ${styles.rowButton}`}
                onClick={() => onEdit(task)} aria-label={`Modifier « ${task.title} »`}>
                Modifier
            </button>
        </li>
    );
}
