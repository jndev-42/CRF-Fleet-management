'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { groupTasksByStatus, TASK_STATUSES, todayIso, vehicleTaskLink, type FleetTask, type TaskStatus } from '@/lib/fleetTracking/tasks';
import TaskColumn from './TaskColumn';
import TaskModal from './TaskModal';
import TasksToolbar, { type TasksView } from './TasksToolbar';
import { TASK_DUE_FILTER } from './tabs';
import { EMPTY_TASK_FILTERS, useFleetTasks, useTaskOptions, type TaskFilterState } from './useFleetTasks';
import styles from './tasks.module.css';

interface Props {
    /** Tâche à ouvrir en modale (`?tache=` : lien de notification), ou `null`. */
    openTaskId: string | null;
    /** Ouvre (`id`) ou ferme (`null`) la modale d'une tâche existante ; écrit l'URL. */
    onOpenTask: (taskId: string | null) => void;
    /** Une tâche a été créée, modifiée, déplacée ou supprimée (badges des sous-onglets). */
    onChanged?: () => void;
    /** Filtre d'ouverture (`?filtre=echeance` : carte « Échéances à traiter »). */
    initialFilter?: string | null;
    /** Premier changement de filtre local : le filtre d'ouverture quitte l'URL. */
    onFilterChanged?: () => void;
}

const VIEW_KEY = 'fleetTracking.tasksView';

/** Modale de création : état initial choisi (« + Ajouter une tâche » d'une colonne). */
type Creating = null | { status: TaskStatus };

/**
 * Onglet « Tâches » : tableau à colonnes (glisser-déposer au pointeur) ou liste,
 * filtres, changement d'état par la pastille de chaque carte, modale de tâche.
 */
export default function TasksTab({ openTaskId, onOpenTask, onChanged, initialFilter, onFilterChanged }: Props) {
    const [filters, setFilterState] = useState<TaskFilterState>(() => ({ ...EMPTY_TASK_FILTERS, due: initialFilter === TASK_DUE_FILTER }));
    const setFilters = (next: TaskFilterState) => {
        setFilterState(next);
        onFilterChanged?.();
    };
    const [view, setView] = useState<TasksView>('board');
    const [creating, setCreating] = useState<Creating>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const { tasks, loading, error, refetch, moveTask, pendingIds } = useFleetTasks(filters);
    // Un lien profond (`?tache=`) arrivé pendant une création remplace le formulaire vide.
    const [shownTaskId, setShownTaskId] = useState(openTaskId);
    if (shownTaskId !== openTaskId) {
        setShownTaskId(openTaskId);
        if (openTaskId) setCreating(null);
    }
    const { assignees, vehicles } = useTaskOptions();
    const today = todayIso();
    // Création pendant un filtre véhicule : la tâche est rattachée d'office à ce véhicule.
    const filterVehicle = filters.vehicle ? vehicles.find(v => v.id === filters.vehicle) : undefined;
    const createDefaults = filterVehicle ? { links: [vehicleTaskLink(filterVehicle)] } : undefined;

    // Préférence d'affichage mémorisée par appareil (confort seulement).
    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(VIEW_KEY);
            // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture de localStorage après hydratation (SSR)
            if (saved === 'board' || saved === 'list') setView(saved);
        } catch {
            // Stockage indisponible : affichage par défaut.
        }
    }, []);
    const changeView = (next: TasksView) => {
        setView(next);
        try {
            window.localStorage.setItem(VIEW_KEY, next);
        } catch {
            // Stockage indisponible : préférence non mémorisée.
        }
    };

    const groups = useMemo(() => groupTasksByStatus(tasks), [tasks]);
    const filtered = filters.q.trim() !== '' || !!filters.vehicle || !!filters.assignee || filters.pinned || !!filters.priority || filters.due;

    const handleMove = async (task: FleetTask, status: TaskStatus) => {
        const message = await moveTask(task, status);
        setActionError(message);
        if (!message) onChanged?.();
    };
    const handleDrop = (taskId: string, status: TaskStatus) => {
        const task = tasks.find(t => t.id === taskId);
        if (task && !pendingIds.has(task.id)) void handleMove(task, status);
    };

    const modalOpen = creating !== null || openTaskId !== null;
    const closeModal = () => {
        setCreating(null);
        if (openTaskId) {
            onOpenTask(null);
            // Pièces jointes ajoutées ou retirées sans « Enregistrer » : compteur des cartes à jour.
            void refetch();
        }
    };

    return (
        <div>
            <TasksToolbar
                filters={filters}
                onChange={setFilters}
                vehicles={vehicles}
                assignees={assignees}
                view={view}
                onViewChange={changeView}
                onCreate={() => setCreating({ status: 'TODO' })}
            />

            {(error || actionError) && <p role="alert" className={styles.error}>{actionError || error}</p>}

            {loading ? (
                <div className={styles.board} role="status" aria-label="Chargement des tâches">
                    {TASK_STATUSES.map(s => <div key={s} className={styles.skeleton} />)}
                </div>
            ) : tasks.length === 0 && !error ? (
                <div className={styles.empty}>
                    <p>{filtered ? 'Aucune tâche ne correspond aux filtres.' : 'Aucune tâche pour l’instant'}</p>
                    {!filtered && (
                        <button type="button" className="btn btn-primary" onClick={() => setCreating({ status: 'TODO' })}>
                            <Plus size={16} aria-hidden="true" /> Tâche
                        </button>
                    )}
                </div>
            ) : (
                <div className={view === 'board' ? styles.board : styles.list}>
                    {(view === 'board' ? TASK_STATUSES : (['IN_PROGRESS', 'TODO', 'WAITING', 'DONE'] as const)).map(status => (
                        <TaskColumn
                            key={status}
                            status={status}
                            tasks={groups[status]}
                            today={today}
                            board={view === 'board'}
                            onOpen={task => onOpenTask(task.id)}
                            onMove={handleMove}
                            onDropTask={handleDrop}
                            onAdd={view === 'board' ? s => setCreating({ status: s }) : undefined}
                            pendingIds={pendingIds}
                        />
                    ))}
                </div>
            )}

            {modalOpen && (
                <TaskModal
                    key={openTaskId ?? 'new'}
                    taskId={creating ? null : openTaskId}
                    initialStatus={creating?.status ?? 'TODO'}
                    assignees={assignees}
                    defaults={creating ? createDefaults : undefined}
                    onClose={closeModal}
                    onSaved={(message) => {
                        setActionError(message ?? null);
                        void refetch();
                        onChanged?.();
                    }}
                />
            )}
        </div>
    );
}
