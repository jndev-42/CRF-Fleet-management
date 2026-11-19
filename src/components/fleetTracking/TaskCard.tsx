'use client';

import { AlertTriangle, CalendarDays, Car, Paperclip, Pin, Tag, Wrench } from 'lucide-react';
import {
    dueTone,
    formatDueDate,
    formatFrDate,
    initialsOf,
    TASK_DRAG_MIME,
    type FleetTask,
    type LinkType,
    type TaskStatus,
} from '@/lib/fleetTracking/tasks';
import TaskStatusPill from './TaskStatusPill';
import styles from './tasks.module.css';

interface Props {
    task: FleetTask;
    today: string;
    onOpen: (task: FleetTask) => void;
    onMove: (task: FleetTask, status: TaskStatus) => void;
    /** Glisser-déposer au pointeur (tableau à colonnes). */
    draggable?: boolean;
    /** Changement d'état en cours d'enregistrement : pastille et glisser désactivés. */
    pending?: boolean;
}

const LINK_ICONS: Record<LinkType, typeof Car> = {
    VEHICLE: Car,
    CONTACT: Tag,
    INCIDENT: AlertTriangle,
    MAINTENANCE: Wrench,
};

/** Carte d'une tâche : pastilles, titre, échéance, pièces jointes, assignés et pastille d'état. */
export default function TaskCard({ task, today, onOpen, onMove, draggable = false, pending = false }: Props) {
    const done = task.status === 'DONE';
    const tone = done ? null : dueTone(task.dueDate, today);

    return (
        <article
            className={`${styles.card}${done ? ` ${styles.cardDone}` : ''}`}
            draggable={draggable && !pending}
            aria-busy={pending || undefined}
            onDragStart={e => {
                e.dataTransfer.setData(TASK_DRAG_MIME, task.id);
                e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={() => onOpen(task)}
            aria-label={task.title}
            data-testid={`task-card-${task.id}`}
        >
            {(task.links.length > 0 || task.priority === 'HIGH' || task.pinned) && (
                <div className={styles.pills}>
                    {task.links.map(link => {
                        const Icon = LINK_ICONS[link.type];
                        return (
                            <span key={`${link.type}:${link.id}`} className={`${styles.pill} ${styles[`pill_${link.type}`]}`}>
                                <Icon size={12} aria-hidden="true" /> {link.label}
                            </span>
                        );
                    })}
                    {task.priority === 'HIGH' && <span className={`${styles.pill} ${styles.pillHigh}`}>Prioritaire</span>}
                    {task.pinned && <Pin size={14} className={styles.pinIcon} aria-label="Épinglée" />}
                </div>
            )}
            <button type="button" className={styles.cardTitle} onClick={e => { e.stopPropagation(); onOpen(task); }}>
                {task.title}
            </button>
            <div className={styles.cardMeta}>
                <span className={`${styles.due}${tone ? ` ${styles[`due_${tone}`]}` : ''}`}>
                    {done
                        ? <>✓ {formatFrDate(task.completedAt).slice(0, 5)}</>
                        : <><CalendarDays size={13} aria-hidden="true" /> {formatDueDate(task.dueDate)}</>}
                    {task.attachmentCount > 0 && (
                        <span className={styles.clip} aria-label={`${task.attachmentCount} pièce(s) jointe(s)`}>
                            <Paperclip size={13} aria-hidden="true" /> {task.attachmentCount}
                        </span>
                    )}
                </span>
                <span className={styles.avatars}>
                    {task.assignees.map(a => (
                        <span key={a.id} className={styles.avatar} title={a.name} aria-label={a.name}>{initialsOf(a.name)}</span>
                    ))}
                </span>
            </div>
            <TaskStatusPill status={task.status} taskTitle={task.title} onChange={s => onMove(task, s)} disabled={pending} />
        </article>
    );
}
