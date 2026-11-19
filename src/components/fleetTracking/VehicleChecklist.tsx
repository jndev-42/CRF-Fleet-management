'use client';

import { useState } from 'react';
import type { DossierVehicle } from '@/lib/fleetTracking/dossiers';
import type { LinkTarget } from '@/lib/fleetTracking/tasks';
import styles from './dossiers.module.css';
import taskStyles from './tasks.module.css';

/** Au-delà, une recherche filtre la liste. */
const SEARCH_THRESHOLD = 8;

interface Props {
    /** Véhicules de l'UL proposés. */
    vehicles: LinkTarget[];
    /** Véhicules déjà portés par le dossier mais partis de l'UL : restent cochables. */
    extra?: DossierVehicle[];
    /** Identifiants cochés, dans l'ordre de choix. */
    value: string[];
    onChange: (ids: string[]) => void;
    loading?: boolean;
}

interface Option {
    id: string;
    label: string;
    detail: string | null;
}

/** Choix d'un ou plusieurs véhicules (cases à cocher, recherche dès que la liste est longue). */
export default function VehicleChecklist({ vehicles, extra = [], value, onChange, loading = false }: Props) {
    const [query, setQuery] = useState('');
    const options: Option[] = [
        ...vehicles.map(v => ({ id: v.id, label: v.label, detail: v.detail })),
        ...extra.filter(e => !vehicles.some(v => v.id === e.id)).map(e => ({ id: e.id, label: e.name, detail: null })),
    ];
    const q = query.trim().toLowerCase();
    const shown = q ? options.filter(o => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(q)) : options;
    const toggle = (id: string, checked: boolean) => {
        onChange(checked ? [...value, id] : value.filter(v => v !== id));
    };

    return (
        <fieldset className={styles.vehicleFieldset}>
            <legend className="form-label">Véhicules *</legend>
            {options.length > SEARCH_THRESHOLD && (
                <>
                    <label className={taskStyles.srOnly} htmlFor="dossier-vehicle-search">Rechercher un véhicule</label>
                    <input id="dossier-vehicle-search" type="search" className="form-input" placeholder="Rechercher un véhicule"
                        value={query} onChange={e => setQuery(e.target.value)} />
                </>
            )}
            {loading ? (
                <p role="status" className={taskStyles.dim}>Chargement des véhicules…</p>
            ) : options.length === 0 ? (
                <p className={taskStyles.dim}>Aucun véhicule dans votre UL.</p>
            ) : (
                <ul className={styles.vehicleChecklist}>
                    {shown.map(o => (
                        <li key={o.id}>
                            <label className={styles.vehicleOption}>
                                <input type="checkbox" checked={value.includes(o.id)} onChange={e => toggle(o.id, e.target.checked)} />
                                <span>{o.label}{o.detail ? <span className={taskStyles.dim}> · {o.detail}</span> : null}</span>
                            </label>
                        </li>
                    ))}
                    {shown.length === 0 && <li className={taskStyles.dim}>Aucun véhicule ne correspond.</li>}
                </ul>
            )}
            <span className={taskStyles.hint} aria-live="polite">
                {value.length === 0 ? 'Aucun véhicule choisi' : `${value.length} véhicule${value.length > 1 ? 's' : ''} choisi${value.length > 1 ? 's' : ''}`}
            </span>
        </fieldset>
    );
}
