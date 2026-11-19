'use client';

import { useDossierOptions } from './useFleetDossiers';

interface Props {
    value: string | null;
    onChange: (dossierId: string | null) => void;
    /** Dossier enregistré sur la tâche : proposé même s'il est clos. */
    current: string | null;
}

/**
 * Choix du dossier d'une tâche parmi les dossiers ouverts de l'UL (« Aucun dossier »
 * par défaut) ; le dossier actuel de la tâche reste proposé s'il est clos (« (clos) »).
 */
export default function DossierSelect({ value, onChange, current }: Props) {
    const dossiers = useDossierOptions();
    const shown = dossiers.filter(d => d.status === 'OPEN' || d.id === current);
    return (
        <div className="form-group">
            <label className="form-label" htmlFor="task-dossier">Dossier</label>
            <select id="task-dossier" className="form-select" value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
                <option value="">Aucun dossier</option>
                {current && !shown.some(d => d.id === current) && <option value={current}>Dossier actuel</option>}
                {shown.map(d => (
                    <option key={d.id} value={d.id}>{d.title}{d.status === 'CLOSED' ? ' (clos)' : ''} — {d.vehicle.name}</option>
                ))}
            </select>
        </div>
    );
}
