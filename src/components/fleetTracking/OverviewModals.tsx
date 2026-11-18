'use client';

import DossierModal from './DossierModal';
import TaskModal from './TaskModal';
import { useTaskOptions } from './useFleetTasks';

/** Modale ouverte depuis la vue d'ensemble. */
export type OverviewModal =
    | { kind: 'task'; taskId: string | null }
    | { kind: 'dossier' };

interface Props {
    modal: OverviewModal;
    onClose: () => void;
    /** Tâche enregistrée ou supprimée (`message` : information à afficher). */
    onTaskSaved: (message?: string) => void;
    /** Dossier créé : son identifiant (vide si la réponse n'en donne pas). */
    onDossierCreated: (dossierId: string) => void;
}

/**
 * Modales de la vue d'ensemble (tâche à créer ou modifier, nouveau dossier). Montée
 * seulement à l'ouverture : les assignés et véhicules ne sont chargés qu'à ce moment.
 */
export default function OverviewModals({ modal, onClose, onTaskSaved, onDossierCreated }: Props) {
    const { assignees, vehicles } = useTaskOptions();
    if (modal.kind === 'dossier') {
        return <DossierModal dossier={null} vehicles={vehicles} onClose={onClose} onSaved={onDossierCreated} />;
    }
    return (
        <TaskModal
            key={modal.taskId ?? 'new'}
            taskId={modal.taskId}
            initialStatus="TODO"
            assignees={assignees}
            onClose={onClose}
            onSaved={onTaskSaved}
        />
    );
}
