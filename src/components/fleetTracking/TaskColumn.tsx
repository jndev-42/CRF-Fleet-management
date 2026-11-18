'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DONE_COLLAPSE_LIMIT, TASK_DRAG_MIME, TASK_STATUS_LABELS, type FleetTask, type TaskStatus } from '@/lib/fleetTracking/tasks';
import TaskCard from './TaskCard';
import styles from './tasks.module.css';

interface Props {
    status: TaskStatus;
    tasks: FleetTask[];
    today: string;
    /** Tableau : la colonne accepte le dépôt d'une carte. Liste : section empilée. */
    board: boolean;
    onOpen: (task: FleetTask) => void;
    onMove: (task: FleetTask, status: TaskStatus) => void;
    /** Dépôt d'une carte (identifiant) dans cette colonne. */
    onDropTask: (taskId: string, status: TaskStatus) => void;
    onAdd?: (status: TaskStatus) => void;
    /** Tâches dont le changement d'état est en cours. */
    pendingIds?: ReadonlySet<string>;
}

/**
 * Une colonne (ou section) d'état. « Terminé » est replié au-delà de
 * `DONE_COLLAPSE_LIMIT` cartes : « Afficher les N autres » — rien n'est purgé.
 */
export default function TaskColumn({ status, tasks, today, board, onOpen, onMove, onDropTask, onAdd, pendingIds }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const collapsible = status === 'DONE' && tasks.length > DONE_COLLAPSE_LIMIT;
    const visible = collapsible && !expanded ? tasks.slice(0, DONE_COLLAPSE_LIMIT) : tasks;
    const hidden = tasks.length - visible.length;

    const dropProps = board ? {
        onDragOver: (e: React.DragEvent) => {
            // Seule une carte de tâche est déposable (pas un texte ou un fichier venu d'ailleurs).
            if (!Array.from(e.dataTransfer.types ?? []).includes(TASK_DRAG_MIME)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!dragOver) setDragOver(true);
        },
        onDragLeave: (e: React.DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const id = Array.from(e.dataTransfer.types ?? []).includes(TASK_DRAG_MIME) ? e.dataTransfer.getData(TASK_DRAG_MIME) : '';
            if (id) onDropTask(id, status);
        },
    } : {};

    return (
        <section
            className={`${board ? styles.column : styles.section}${dragOver ? ` ${styles.dropTarget}` : ''}`}
            aria-label={`${TASK_STATUS_LABELS[status]} (${tasks.length})`}
            data-status={status}
            {...dropProps}
        >
            <h3 className={styles.columnHeader}>
                <span className={`${styles.columnName} ${styles[`state_${status}`]}`}>
                    <span className={styles.dot} aria-hidden="true" /> {TASK_STATUS_LABELS[status]}
                </span>
                <span className={styles.count}>{tasks.length}</span>
            </h3>
            <div className={styles.cards}>
                {visible.map(task => (
                    <TaskCard key={task.id} task={task} today={today} onOpen={onOpen} onMove={onMove} draggable={board} pending={pendingIds?.has(task.id)} />
                ))}
            </div>
            {collapsible && (
                <button type="button" className={styles.linkBtn} onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
                    {expanded ? 'Replier' : `Afficher les ${hidden} autres`}
                </button>
            )}
            {onAdd && status !== 'DONE' && (
                <button type="button" className={styles.linkBtn} onClick={() => onAdd(status)}>
                    <Plus size={14} aria-hidden="true" /> Ajouter une tâche
                </button>
            )}
        </section>
    );
}
