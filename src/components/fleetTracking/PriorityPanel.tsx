'use client';

import { Pin } from 'lucide-react';
import { visibleVehicles } from '@/lib/fleetTracking/dossiers';
import type { FleetOverview, PriorityItem } from '@/lib/fleetTracking/overview';
import { dueTone, formatDueDate, type FleetTask } from '@/lib/fleetTracking/tasks';
import styles from './overview.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    priority: FleetOverview['priority'];
    /** Jour de référence (`YYYY-MM-DD`) de la couleur d'échéance. */
    today: string;
    onOpenTask: (task: FleetTask) => void;
    onOpenDossier: (dossierId: string) => void;
}

function vehicleNames(task: FleetTask): string[] {
    return task.links.filter(l => l.type === 'VEHICLE' && !l.missing).map(l => l.label);
}

function Item({ item, today, onOpenTask, onOpenDossier }: { item: PriorityItem } & Omit<Props, 'priority'>) {
    if (item.kind === 'DOSSIER') {
        const d = item.dossier;
        return (
            <li className={styles.prioItem}>
                <div className={styles.prioTitle}>Dossier « {d.title} »</div>
                <div className={taskStyles.pills}>
                    {visibleVehicles(d).map(v => <span key={v.id} className={taskStyles.pill}>{v.name}</span>)}
                    {d.missingItemCount > 0 && (
                        <span className={taskStyles.dim}>
                            {d.missingItemCount} pièce{d.missingItemCount > 1 ? 's' : ''} à récupérer
                        </span>
                    )}
                    <span className={taskStyles.dim}>
                        {item.dueDate ? `Prochaine échéance ${formatDueDate(item.dueDate)}` : 'Aucune échéance'}
                    </span>
                </div>
                <button type="button" className={`btn btn-secondary btn-sm ${styles.rowButton}`} onClick={() => onOpenDossier(d.id)}>
                    Ouvrir le dossier
                </button>
            </li>
        );
    }
    const t = item.task;
    const tone = dueTone(t.dueDate, today);
    return (
        <li className={styles.prioItem}>
            <div className={styles.prioTitle}>
                {t.title}
                {t.pinned && <Pin size={14} className={taskStyles.pinIcon} aria-label="Épinglée" />}
            </div>
            <div className={taskStyles.pills}>
                {vehicleNames(t).map(name => <span key={name} className={taskStyles.pill}>{name}</span>)}
                {t.priority === 'HIGH' && <span className={`${taskStyles.pill} ${taskStyles.pillHigh}`}>Prioritaire</span>}
                <span className={`${taskStyles.due}${tone ? ` ${taskStyles[`due_${tone}`]}` : ''}`}>
                    {t.dueDate ? `Échéance ${formatDueDate(t.dueDate)}` : 'Date à fixer'}
                </span>
            </div>
            <button type="button" className={`btn btn-secondary btn-sm ${styles.rowButton}`} onClick={() => onOpenTask(t)}>
                Ouvrir la tâche
            </button>
        </li>
    );
}

/**
 * Encart « À confirmer en priorité » : éléments épinglés, sinon la tâche Prioritaire
 * à l'échéance la plus proche ; rien à montrer → encart masqué.
 */
export default function PriorityPanel({ priority, today, onOpenTask, onOpenDossier }: Props) {
    const items: PriorityItem[] = priority.pinned.length > 0
        ? priority.pinned
        : priority.fallback ? [{ kind: 'TASK', dueDate: priority.fallback.dueDate, task: priority.fallback }] : [];
    if (items.length === 0) return null;
    const pinnedCount = priority.pinned.length;
    return (
        <section className={`card ${styles.panel} ${styles.prio}`} aria-labelledby="overview-priority">
            <div className={styles.panelHead}>
                <h3 id="overview-priority" className={styles.panelTitle}>
                    <Pin size={16} aria-hidden="true" /> À confirmer en priorité
                </h3>
                {pinnedCount > 0 && (
                    <span className={`${taskStyles.pill} ${taskStyles.pillHigh}`}>
                        {pinnedCount} épinglé{pinnedCount > 1 ? 's' : ''}
                    </span>
                )}
            </div>
            <ul className={styles.prioList}>
                {items.map(item => (
                    <Item key={`${item.kind}:${item.kind === 'TASK' ? item.task.id : item.dossier.id}`}
                        item={item} today={today} onOpenTask={onOpenTask} onOpenDossier={onOpenDossier} />
                ))}
            </ul>
        </section>
    );
}
