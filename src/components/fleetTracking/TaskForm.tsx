'use client';

import { useState, type FormEvent } from 'react';
import { Pin, PinOff } from 'lucide-react';
import {
    MAX_TASK_DESCRIPTION,
    MAX_TASK_TITLE,
    TASK_PRIORITIES,
    TASK_PRIORITY_LABELS,
    TASK_STATUSES,
    TASK_STATUS_LABELS,
    type AssignableManager,
    type FleetTaskDetail,
    type TaskAssignee,
    type TaskAttachment,
    type TaskLink,
    type TaskPriority,
    type TaskStatus,
} from '@/lib/fleetTracking/tasks';
import AssigneePicker from './AssigneePicker';
import LinkPicker from './LinkPicker';
import TaskAttachments from './TaskAttachments';
import { TASKS_URL } from './useFleetTasks';
import { readError } from './useFleetContacts';
import styles from './tasks.module.css';

interface Props {
    /** `null` : création. */
    task: FleetTaskDetail | null;
    initialStatus: TaskStatus;
    assignees: AssignableManager[];
    currentUserId: string | null;
    saving: boolean;
    setSaving: (on: boolean) => void;
    onCancel: () => void;
    /** Enregistrée ou supprimée : la modale se ferme, `message` éventuel affiché. */
    onDone: (message?: string) => void;
}

/** Même ensemble d'identifiants (ordre indifférent). */
function sameKeys(a: string[], b: string[]): boolean {
    const set = new Set(a);
    return a.length === b.length && b.every(k => set.has(k));
}

/** Champs de la tâche : titre, description, état, priorité, échéance, épingle, assignés, rattachements, pièces jointes. */
export default function TaskForm({ task, initialStatus, assignees, currentUserId, saving, setSaving, onCancel, onDone }: Props) {
    const [title, setTitle] = useState(task?.title ?? '');
    const [description, setDescription] = useState(task?.description ?? '');
    const [status, setStatus] = useState<TaskStatus>(task?.status ?? initialStatus);
    const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'NORMAL');
    const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
    const [pinned, setPinned] = useState(task?.pinned ?? false);
    const [people, setPeople] = useState<TaskAssignee[]>(task?.assignees ?? []);
    const [links, setLinks] = useState<TaskLink[]>(task?.links ?? []);
    const [attachments, setAttachments] = useState<TaskAttachment[]>(task?.attachments ?? []);
    const [error, setError] = useState<string | null>(null);

    const send = async (method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => {
        setSaving(true);
        setError(null);
        try {
            const url = task ? `${TASKS_URL}/${encodeURIComponent(task.id)}` : TASKS_URL;
            const res = await fetch(url, {
                method,
                headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            if (res.status === 404 && task) {
                onDone('Cette tâche n’existe plus : la liste a été actualisée.');
                return;
            }
            if (!res.ok) {
                setError(await readError(res, 'Enregistrement impossible'));
                return;
            }
            onDone();
        } catch {
            setError('Enregistrement impossible');
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setError('Le titre est requis');
            return;
        }
        const assigneeIds = people.map(p => p.id);
        const linkInputs = links.map(l => ({ type: l.type, id: l.id }));
        // En modification, les listes ne sont envoyées que si elles ont changé : un
        // enregistrement ne doit pas écraser les assignés ou rattachements modifiés
        // entre-temps par un autre responsable.
        const assigneesChanged = !task || !sameKeys(assigneeIds, task.assignees.map(a => a.id));
        const linksChanged = !task || !sameKeys(
            linkInputs.map(l => `${l.type}:${l.id}`),
            task.links.map(l => `${l.type}:${l.id}`),
        );
        void send(task ? 'PATCH' : 'POST', {
            title: title.trim(),
            description: description.trim() || null,
            status,
            priority,
            dueDate: dueDate || null,
            pinned,
            ...(assigneesChanged ? { assigneeIds } : {}),
            ...(linksChanged ? { links: linkInputs } : {}),
        });
    };

    const handleDelete = () => {
        if (task && window.confirm(`Supprimer la tâche « ${task.title} » et ses pièces jointes ?`)) void send('DELETE');
    };

    return (
        <form onSubmit={handleSubmit} noValidate>
            <div className="modal-body">
                <button type="button" className={`btn btn-secondary ${styles.pinToggle}`} aria-pressed={pinned} onClick={() => setPinned(p => !p)}>
                    {pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
                    {pinned ? 'Désépingler' : 'Épingler'}
                </button>
                <div className="form-group">
                    <label className="form-label" htmlFor="task-title">Titre *</label>
                    <input id="task-title" data-autofocus className="form-input" value={title} maxLength={MAX_TASK_TITLE} required onChange={e => setTitle(e.target.value)} />
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="task-description">Description</label>
                    <textarea id="task-description" className="form-input" rows={3} value={description} maxLength={MAX_TASK_DESCRIPTION} onChange={e => setDescription(e.target.value)} />
                </div>
                <fieldset className={styles.fieldset}>
                    <legend className="form-label">État</legend>
                    <div className={styles.stateButtons} role="radiogroup" aria-label="État">
                        {TASK_STATUSES.map(s => (
                            <button key={s} type="button" role="radio" aria-checked={status === s}
                                className={`${styles.stateButton} ${styles[`state_${s}`]}${status === s ? ` ${styles.stateButtonOn}` : ''}`}
                                onClick={() => setStatus(s)}>
                                <span className={styles.dot} aria-hidden="true" /> {TASK_STATUS_LABELS[s]}
                            </button>
                        ))}
                    </div>
                </fieldset>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label" htmlFor="task-priority">Priorité</label>
                        <select id="task-priority" className="form-select" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
                            {TASK_PRIORITIES.map(p => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="task-due">Échéance</label>
                        <input id="task-due" type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                        {!dueDate && <span className={styles.hint}>Date à fixer</span>}
                    </div>
                </div>
                <div className="form-group">
                    <span className="form-label">Assignés</span>
                    <AssigneePicker options={assignees} value={people} onChange={setPeople} currentUserId={currentUserId} />
                </div>
                <div className="form-group">
                    <span className="form-label">Rattachements</span>
                    <LinkPicker value={links} onChange={setLinks} />
                </div>
                <div className="form-group">
                    <span className="form-label">Pièces jointes</span>
                    {task
                        ? <TaskAttachments taskId={task.id} attachments={attachments} onChange={setAttachments} />
                        : <p className={styles.hint}>Les pièces jointes s&apos;ajoutent une fois la tâche créée.</p>}
                </div>
                {error && <p role="alert" className={styles.error}>{error}</p>}
            </div>
            <div className="modal-footer">
                {task && (
                    <button type="button" className={`btn btn-secondary ${styles.danger}`} onClick={handleDelete} disabled={saving}>Supprimer</button>
                )}
                <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
        </form>
    );
}
