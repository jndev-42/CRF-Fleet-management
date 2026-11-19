'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { FleetOverview } from '@/lib/fleetTracking/overview';
import NextActions from './NextActions';
import OverviewCounters from './OverviewCounters';
import OverviewModals, { type OverviewModal } from './OverviewModals';
import OverviewVehicles from './OverviewVehicles';
import PriorityPanel from './PriorityPanel';
import type { FleetTabFilter, FleetTrackingTab } from './tabs';
import UndoToast from './UndoToast';
import { useCompleteWithUndo } from './useCompleteWithUndo';
import styles from './overview.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    overview: FleetOverview | null;
    loading: boolean;
    error: string | null;
    /** Une tâche ou un dossier a changé : vue d'ensemble et badges à relire. */
    onChanged: () => void;
    onNavigate: (tab: FleetTrackingTab, filter?: FleetTabFilter) => void;
    onOpenDossier: (dossierId: string) => void;
    /** Tâche ouverte en modale (`?tache=` sur la vue d'ensemble), ou `null`. */
    openTaskId?: string | null;
    /** Ouvre (`id`) ou ferme (`null`) la modale d'une tâche existante ; écrit l'URL. */
    onOpenTask?: (taskId: string | null) => void;
}

/** Durée d'affichage du message d'information après un enregistrement. */
const NOTICE_MS = 5000;

/**
 * Onglet « Vue d'ensemble » (écran 1, CAP-11) : quatre compteurs cliquables,
 * prochaines actions cochables (avec « Annuler »), encart « À confirmer en priorité »
 * et véhicules de l'UL avec leurs dossiers ouverts.
 */
export default function OverviewTab({
    overview, loading, error, onChanged, onNavigate, onOpenDossier, openTaskId = null, onOpenTask = () => {},
}: Props) {
    // Création (tâche ou dossier) ; la modification d'une tâche passe par l'URL (`openTaskId`).
    const [creating, setCreating] = useState<OverviewModal | null>(null);
    const modal: OverviewModal | null = openTaskId ? { kind: 'task', taskId: openTaskId } : creating;
    const [notice, setNotice] = useState<string | null>(null);
    const { hiddenIds, toast, error: completeError, complete, undo, pause, resume } = useCompleteWithUndo(onChanged);

    // Message d'information effacé après quelques secondes (ou à l'action suivante).
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), NOTICE_MS);
        return () => clearTimeout(timer);
    }, [notice]);
    const openCreate = (next: OverviewModal) => {
        setNotice(null);
        setCreating(next);
    };
    const openTask = (taskId: string) => {
        setNotice(null);
        onOpenTask(taskId);
    };
    const closeModal = () => {
        if (openTaskId) onOpenTask(null);
        setCreating(null);
    };

    const header = (
        <div className={styles.head}>
            <div>
                <h2 className={styles.title}>Le point sur la flotte</h2>
                <p className={taskStyles.dim}>Véhicules, dossiers et ce qui doit avancer.</p>
            </div>
            <div className={styles.headActions}>
                <button type="button" className="btn btn-secondary" onClick={() => openCreate({ kind: 'task', taskId: null })}>
                    <Plus size={16} aria-hidden="true" /> Tâche
                </button>
                <button type="button" className="btn btn-primary" onClick={() => openCreate({ kind: 'dossier' })}>
                    <Plus size={16} aria-hidden="true" /> Nouveau dossier
                </button>
            </div>
        </div>
    );

    const modals = modal && (
        <OverviewModals
            modal={modal}
            onClose={closeModal}
            onTaskSaved={(message) => {
                setNotice(message ?? null);
                onChanged();
            }}
            onDossierCreated={(id) => {
                setCreating(null);
                onChanged();
                if (id) onOpenDossier(id);
            }}
        />
    );

    if (!overview) {
        return (
            <div>
                {header}
                {error
                    ? <p role="alert" className={taskStyles.error}>{error}</p>
                    : loading && <p role="status" className={taskStyles.dim}>Chargement de la vue d’ensemble…</p>}
                {modals}
            </div>
        );
    }

    const nextActions = overview.nextActions.filter(t => !hiddenIds.has(t.id));
    const total = Math.max(0, overview.nextActionsTotal - overview.nextActions.filter(t => hiddenIds.has(t.id)).length);

    return (
        <div>
            {header}
            {(error || completeError) && <p role="alert" className={taskStyles.error}>{completeError || error}</p>}
            {notice && <p role="status" className={taskStyles.dim}>{notice}</p>}

            <OverviewCounters counters={overview.counters} onNavigate={onNavigate} />

            <div className={styles.grid}>
                <NextActions
                    tasks={nextActions}
                    total={total}
                    today={overview.today}
                    onComplete={task => {
                        setNotice(null);
                        void complete(task);
                    }}
                    onEdit={task => openTask(task.id)}
                    onShowAll={() => onNavigate('taches')}
                />
                <div className={styles.side}>
                    <PriorityPanel
                        priority={overview.priority}
                        today={overview.today}
                        onOpenTask={task => openTask(task.id)}
                        onOpenDossier={onOpenDossier}
                    />
                    <OverviewVehicles vehicles={overview.vehicles} onOpenVehicle={id => onNavigate('dossiers', { vehicle: id })} />
                </div>
            </div>

            {toast && (
                <UndoToast
                    key={toast.taskId}
                    message={`Tâche « ${toast.title} » terminée`}
                    onUndo={() => void undo()}
                    onPause={pause}
                    onResume={resume}
                />
            )}
            {modals}
        </div>
    );
}
