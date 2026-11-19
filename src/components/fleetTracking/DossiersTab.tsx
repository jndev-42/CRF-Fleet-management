'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { compareDossiers, type DossierStatus } from '@/lib/fleetTracking/dossiers';
import DossierDetail from './DossierDetail';
import DossierListItem from './DossierListItem';
import DossierModal from './DossierModal';
import { DEFAULT_DOSSIER_FILTERS, dossierFiltersQuery, useDossierList, type DossierFilterState } from './useFleetDossiers';
import { useTaskOptions } from './useFleetTasks';
import { DOSSIER_MISSING_FILTER, type FleetTabFilter } from './tabs';
import styles from './dossiers.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    /** Dossier affiché en détail (`?dossier=`), ou `null` : liste. */
    openDossierId: string | null;
    onOpenDossier: (dossierId: string | null) => void;
    /** Un dossier a été créé, modifié ou supprimé (badge de l'onglet). */
    onChanged: () => void;
    /** Filtre d'ouverture (cartes de la vue d'ensemble) : `filtre=pieces`, `vehicule=<id>`. */
    initialFilter?: FleetTabFilter;
    /** Premier changement de filtre local : le filtre d'ouverture quitte l'URL. */
    onFilterChanged?: () => void;
}

const STATUS_FILTERS: { value: '' | DossierStatus; label: string }[] = [
    { value: 'OPEN', label: 'Ouverts' },
    { value: 'CLOSED', label: 'Clos' },
    { value: '', label: 'Tous' },
];

/** Onglet « Dossiers » : liste filtrable (état, véhicule), création, détail d'un dossier. */
export default function DossiersTab({ openDossierId, onOpenDossier, onChanged, initialFilter, onFilterChanged }: Props) {
    const [filters, setFilterState] = useState<DossierFilterState>(() => ({
        ...DEFAULT_DOSSIER_FILTERS,
        vehicle: initialFilter?.vehicle ?? '',
    }));
    // « Pièces à récupérer » : dossiers ayant au moins une pièce non reçue (filtre local).
    const [missingOnly, setMissingOnly] = useState(initialFilter?.filter === DOSSIER_MISSING_FILTER);
    const setFilters = (update: (prev: DossierFilterState) => DossierFilterState) => {
        setFilterState(update);
        onFilterChanged?.();
    };
    const [creating, setCreating] = useState(false);
    const { dossiers, loading, error, refetch } = useDossierList(dossierFiltersQuery(filters));
    const { assignees, vehicles, vehiclesLoaded } = useTaskOptions();
    // Véhicule d'ouverture (`?vehicule=`) inconnu de l'UL : filtre retiré une fois la liste reçue.
    if (vehiclesLoaded && filters.vehicle && !vehicles.some(v => v.id === filters.vehicle)) {
        setFilterState(prev => ({ ...prev, vehicle: '' }));
    }
    const sorted = useMemo(
        () => dossiers.filter(d => !missingOnly || d.missingItemCount > 0).sort(compareDossiers),
        [dossiers, missingOnly],
    );

    if (openDossierId) {
        return (
            <DossierDetail
                key={openDossierId}
                dossierId={openDossierId}
                vehicles={vehicles}
                assignees={assignees}
                onBack={() => {
                    onOpenDossier(null);
                    void refetch();
                }}
                onChanged={onChanged}
            />
        );
    }

    return (
        <div>
            <div className={taskStyles.toolbar}>
                <div className={taskStyles.filterGroup} role="group" aria-label="État des dossiers">
                    {STATUS_FILTERS.map(f => (
                        <button key={f.label} type="button" aria-pressed={filters.status === f.value}
                            className={`filter-btn${filters.status === f.value ? ' active' : ''}`}
                            onClick={() => setFilters(prev => ({ ...prev, status: f.value }))}>
                            {f.label}
                        </button>
                    ))}
                </div>
                <button type="button" aria-pressed={missingOnly}
                    className={`filter-btn${missingOnly ? ' active' : ''}`}
                    onClick={() => {
                        setMissingOnly(v => !v);
                        onFilterChanged?.();
                    }}>
                    Pièces à récupérer
                </button>
                <label className={taskStyles.srOnly} htmlFor="dossier-vehicle-filter">Véhicule</label>
                <select id="dossier-vehicle-filter" className="form-select" value={filters.vehicle}
                    onChange={e => setFilters(prev => ({ ...prev, vehicle: e.target.value }))}>
                    <option value="">Tous les véhicules</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
                <div className={taskStyles.toolbarEnd}>
                    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                        <Plus size={16} aria-hidden="true" /> Nouveau dossier
                    </button>
                </div>
            </div>

            {error && <p role="alert" className={taskStyles.error}>{error}</p>}

            {loading ? (
                <p role="status" className={taskStyles.dim}>Chargement des dossiers…</p>
            ) : sorted.length === 0 && !error ? (
                <div className={taskStyles.empty}>
                    <p>{filters.status === 'CLOSED' ? 'Aucun dossier clos.' : filters.vehicle || missingOnly || filters.status === '' ? 'Aucun dossier ne correspond aux filtres.' : 'Aucun dossier ouvert'}</p>
                </div>
            ) : (
                <ul className={styles.list}>
                    {sorted.map(d => <DossierListItem key={d.id} dossier={d} onOpen={() => onOpenDossier(d.id)} />)}
                </ul>
            )}

            {creating && (
                <DossierModal
                    dossier={null}
                    vehicles={vehicles}
                    initialVehicleIds={filters.vehicle ? [filters.vehicle] : undefined}
                    onClose={() => setCreating(false)}
                    onSaved={(id) => {
                        setCreating(false);
                        onChanged();
                        onOpenDossier(id);
                    }}
                />
            )}
        </div>
    );
}
