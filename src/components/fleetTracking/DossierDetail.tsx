'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { FleetDossierDetail } from '@/lib/fleetTracking/dossiers';
import type { AssignableManager, LinkTarget, TaskAttachment } from '@/lib/fleetTracking/tasks';
import DossierHeader from './DossierHeader';
import DossierItems from './DossierItems';
import DossierLinks from './DossierLinks';
import DossierModal from './DossierModal';
import DossierTasks from './DossierTasks';
import TaskAttachments from './TaskAttachments';
import { DOSSIERS_URL, useDossierDetail } from './useFleetDossiers';
import styles from './dossiers.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    dossierId: string;
    vehicles: LinkTarget[];
    assignees: AssignableManager[];
    /** Retour à la liste des dossiers. */
    onBack: () => void;
    /** Le dossier a changé d'état, d'épingle, ou a été supprimé. */
    onChanged: () => void;
}

/**
 * Détail d'un dossier (écran 3) : en-tête (état, véhicule, épingle, Clore / Rouvrir,
 * Supprimer), pièces à récupérer, tâches du dossier, pièces jointes, véhicule et
 * objets rattachés à ses tâches.
 */
export default function DossierDetail({ dossierId, vehicles, assignees, onBack, onChanged }: Props) {
    const { load, refetch, update } = useDossierDetail(dossierId);
    const [editing, setEditing] = useState(false);

    const back = (
        <button type="button" className={`btn btn-secondary ${styles.back}`} onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" /> Dossiers
        </button>
    );

    if (load.state === 'loading') return <div>{back}<p role="status" className={taskStyles.dim}>Chargement du dossier…</p></div>;
    if (load.state === 'error') return <div>{back}<p role="alert" className={taskStyles.error}>{load.message}</p></div>;

    const dossier = load.dossier;
    const replace = (next: FleetDossierDetail) => {
        update(() => next);
        onChanged();
    };
    const setAttachments = (fn: TaskAttachment[] | ((prev: TaskAttachment[]) => TaskAttachment[])) =>
        update(d => {
            const attachments = typeof fn === 'function' ? fn(d.attachments) : fn;
            // Une pièce jointe retirée n'est plus le fichier d'aucune pièce à récupérer.
            const ids = new Set(attachments.map(a => a.id));
            return {
                ...d,
                attachments,
                attachmentCount: attachments.length,
                items: d.items.map(i => (i.attachmentId && !ids.has(i.attachmentId) ? { ...i, attachmentId: null, attachmentName: null } : i)),
            };
        });

    return (
        <div>
            {back}
            <DossierHeader dossier={dossier} onReplace={replace} onEdit={() => setEditing(true)} onDeleted={() => { onChanged(); onBack(); }} />
            <div className={styles.detailGrid}>
                <div className={styles.detailMain}>
                    <DossierItems dossier={dossier} onUpdate={update} onAttachmentAdded={a => setAttachments(list => [...list, a])} />
                    <DossierTasks dossier={dossier} assignees={assignees} onTasksChanged={() => { void refetch(); onChanged(); }} />
                    <section className={styles.card} aria-labelledby="dossier-files-title">
                        <h3 id="dossier-files-title" className={styles.cardTitle}>Pièces jointes</h3>
                        <TaskAttachments
                            baseUrl={`${DOSSIERS_URL}/${encodeURIComponent(dossier.id)}/attachments`}
                            attachments={dossier.attachments}
                            onChange={setAttachments}
                        />
                    </section>
                </div>
                <DossierLinks dossier={dossier} />
            </div>

            {editing && (
                <DossierModal
                    dossier={dossier}
                    vehicles={vehicles}
                    onClose={() => setEditing(false)}
                    onSaved={() => {
                        setEditing(false);
                        onChanged();
                        void refetch();
                    }}
                />
            )}
        </div>
    );
}
