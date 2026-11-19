'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { visibleVehicles, type FleetDossierDetail } from '@/lib/fleetTracking/dossiers';
import {
    compareTasks,
    formatDueDate,
    MAX_TASK_LINKS,
    TASK_STATUS_LABELS,
    vehicleTaskLink,
    type AssignableManager,
    type TaskLink,
} from '@/lib/fleetTracking/tasks';
import TaskModal from './TaskModal';
import styles from './dossiers.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    dossier: FleetDossierDetail;
    assignees: AssignableManager[];
    /** Une tâche a été créée, modifiée ou supprimée : le dossier est relu, la liste et le badge aussi. */
    onTasksChanged: () => void;
}

/** Modale ouverte : `null` fermée, `{ taskId: null }` création dans le dossier. */
type Open = null | { taskId: string | null };

/** Tâches du dossier ; « + Tâche » crée une tâche rattachée au dossier et à ses véhicules. */
export default function DossierTasks({ dossier, assignees, onTasksChanged }: Props) {
    const [open, setOpen] = useState<Open>(null);
    const tasks = [...dossier.tasks].sort((a, b) => {
        if ((a.status === 'DONE') !== (b.status === 'DONE')) return a.status === 'DONE' ? 1 : -1;
        return compareTasks(a, b);
    });
    const vehicleLinks: TaskLink[] = visibleVehicles(dossier)
        .slice(0, MAX_TASK_LINKS)
        .map(v => vehicleTaskLink({ id: v.id, label: v.name, detail: v.plate }));

    return (
        <section className={styles.card} aria-labelledby="dossier-tasks-title">
            <div className={styles.cardHeader}>
                <h3 id="dossier-tasks-title" className={styles.cardTitle}>Tâches du dossier</h3>
                <button type="button" className="btn btn-secondary" onClick={() => setOpen({ taskId: null })}>
                    <Plus size={16} aria-hidden="true" /> Tâche
                </button>
            </div>
            {tasks.length === 0 && <p className={taskStyles.dim}>Aucune tâche dans ce dossier.</p>}
            <ul className={styles.items}>
                {tasks.map(t => (
                    <li key={t.id} className={styles.taskRow}>
                        <button type="button" className={styles.taskButton} onClick={() => setOpen({ taskId: t.id })}>
                            <span className={t.status === 'DONE' ? styles.taskDone : undefined}>{t.title}</span>
                        </button>
                        <span className={`${styles.taskState} ${taskStyles[`state_${t.status}`]}`}>
                            <span className={taskStyles.dot} aria-hidden="true" /> {TASK_STATUS_LABELS[t.status]}
                        </span>
                        <span className={styles.rowMeta}>
                            {[t.assignees.map(a => a.name).join(', '), formatDueDate(t.dueDate)].filter(Boolean).join(' · ')}
                        </span>
                    </li>
                ))}
            </ul>
            {open && (
                <TaskModal
                    key={open.taskId ?? 'new'}
                    taskId={open.taskId}
                    initialStatus="TODO"
                    assignees={assignees}
                    defaults={{ dossierId: dossier.id, links: vehicleLinks }}
                    onClose={() => setOpen(null)}
                    onSaved={() => onTasksChanged()}
                />
            )}
        </section>
    );
}
