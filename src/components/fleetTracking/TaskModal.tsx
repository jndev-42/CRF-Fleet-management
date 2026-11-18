'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { AssignableManager, FleetTaskDetail, TaskStatus } from '@/lib/fleetTracking/tasks';
import TaskForm from './TaskForm';
import { TASKS_URL } from './useFleetTasks';
import { readError } from './useFleetContacts';
import { useModalFocus } from './useModalFocus';
import styles from './tasks.module.css';

interface Props {
    /** `null` : création. Sinon la tâche est chargée (lien profond `?tache=` compris). */
    taskId: string | null;
    initialStatus: TaskStatus;
    assignees: AssignableManager[];
    onClose: () => void;
    /** Enregistrée ou supprimée (`message` : information à afficher) ; la liste est rechargée. */
    onSaved: (message?: string) => void;
}

type Loaded = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; task: FleetTaskDetail | null };

/** Modale de création ou de modification d'une tâche. */
export default function TaskModal({ taskId, initialStatus, assignees, onClose, onSaved }: Props) {
    const [saving, setSaving] = useState(false);
    const requestClose = () => {
        if (!saving) onClose();
    };
    const dialogRef = useModalFocus<HTMLDivElement>(requestClose);
    const { data: session } = useSession();
    const [loaded, setLoaded] = useState<Loaded>(taskId ? { state: 'loading' } : { state: 'ready', task: null });

    useEffect(() => {
        if (!taskId) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${TASKS_URL}/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
                if (cancelled) return;
                if (!res.ok) {
                    // Lien de notification ouvert avec une autre UL active (403), ou tâche supprimée (404).
                    const message = res.status === 403
                        ? 'Cette tâche appartient à une autre unité locale : changez d’UL dans l’en-tête pour l’ouvrir.'
                        : res.status === 404
                            ? 'Tâche introuvable'
                            : await readError(res, 'Ouverture de la tâche impossible.');
                    setLoaded({ state: 'error', message });
                    return;
                }
                const data = await res.json() as { task: FleetTaskDetail };
                if (!cancelled) setLoaded({ state: 'ready', task: data.task });
            } catch {
                if (!cancelled) setLoaded({ state: 'error', message: 'Ouverture de la tâche impossible.' });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [taskId]);

    const title = taskId ? 'Modifier la tâche' : 'Nouvelle tâche';

    return (
        <div className="modal-overlay" onClick={requestClose}>
            <div ref={dialogRef} className={`modal ${styles.modal}`} role="dialog" aria-modal="true" aria-labelledby="task-modal-title" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 id="task-modal-title" className="modal-title">{title}</h2>
                    <button type="button" className="modal-close" onClick={requestClose} disabled={saving} aria-label="Fermer la modale">✕</button>
                </div>
                {loaded.state === 'loading' && <div className="modal-body"><p role="status" className={styles.dim}>Chargement de la tâche…</p></div>}
                {loaded.state === 'error' && (
                    <>
                        <div className="modal-body"><p role="alert" className={styles.error}>{loaded.message}</p></div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={requestClose}>Fermer</button>
                        </div>
                    </>
                )}
                {loaded.state === 'ready' && (
                    <TaskForm
                        task={loaded.task}
                        initialStatus={initialStatus}
                        assignees={assignees}
                        currentUserId={session?.user?.id ?? null}
                        saving={saving}
                        setSaving={setSaving}
                        onCancel={requestClose}
                        onDone={(message) => {
                            onSaved(message);
                            onClose();
                        }}
                    />
                )}
            </div>
        </div>
    );
}
