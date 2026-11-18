'use client';

import { useMemo, useState } from 'react';
import {
    CONTROL_FILTERS,
    CONTROL_FILTER_LABELS,
    matchesControlFilter,
    type ControlFilter,
    type ControlRow,
} from '@/lib/fleetTracking/controls';
import AppointmentModal, { type AppointmentSaved } from './AppointmentModal';
import ControlsTable from './ControlsTable';
import { useFleetControls } from './useFleetControls';
import taskStyles from './tasks.module.css';

const EMPTY_MESSAGES: Record<ControlFilter, string> = {
    all: 'Aucune échéance de contrôle : renseignez la mise en circulation, les révisions ou le suivi de désinfection des véhicules.',
    to_schedule: 'Aucune échéance à dater.',
    soon: 'Aucune échéance dans les 30 prochains jours.',
    overdue: 'Aucune échéance dépassée.',
    scheduled: 'Aucun rendez-vous fixé.',
};

interface Props {
    /** Un rendez-vous (et éventuellement sa tâche) a été enregistré ou supprimé. */
    onChanged?: () => void;
}

/**
 * Onglet « Contrôles » : échéances CT, révision et désinfection des véhicules de l'UL
 * (calculées depuis les données véhicule), filtrables, avec la saisie d'un rendez-vous.
 */
export default function ControlsTab({ onChanged }: Props) {
    const [filter, setFilter] = useState<ControlFilter>('all');
    const [editing, setEditing] = useState<ControlRow | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const { controls, counts, today, loading, error, refetch } = useFleetControls();
    const changed = () => {
        void refetch();
        onChanged?.();
    };
    const handleSaved = (result: AppointmentSaved) => {
        setEditing(null);
        setNotice(result.deleted ? 'Rendez-vous supprimé' : result.taskCreated ? 'Rendez-vous enregistré · Tâche créée' : 'Rendez-vous enregistré');
        changed();
    };
    const visible = useMemo(() => controls.filter(r => matchesControlFilter(r, filter)), [controls, filter]);

    return (
        <div>
            <div className={taskStyles.toolbar}>
                <div className={taskStyles.filterGroup} role="group" aria-label="Filtrer les échéances">
                    {CONTROL_FILTERS.map(f => (
                        <button key={f} type="button" aria-pressed={filter === f}
                            className={`filter-btn${filter === f ? ' active' : ''}`}
                            onClick={() => setFilter(f)}>
                            {CONTROL_FILTER_LABELS[f]} ({counts[f]})
                        </button>
                    ))}
                </div>
            </div>

            {error && <p role="alert" className={taskStyles.error}>{error}</p>}
            {notice && <p role="status" className={taskStyles.dim}>{notice}</p>}

            {loading ? (
                <p role="status" className={taskStyles.dim}>Chargement des contrôles…</p>
            ) : visible.length > 0 ? (
                <ControlsTable rows={visible} onEdit={row => { setNotice(null); setEditing(row); }} />
            ) : !error && (
                <div className={taskStyles.empty}><p>{EMPTY_MESSAGES[filter]}</p></div>
            )}

            {editing && (
                <AppointmentModal
                    row={editing}
                    today={today}
                    onClose={() => setEditing(null)}
                    onSaved={handleSaved}
                    onPartiallySaved={changed}
                />
            )}
        </div>
    );
}
