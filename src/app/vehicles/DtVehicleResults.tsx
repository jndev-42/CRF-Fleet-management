'use client';

import type { RenaultVehicleData } from '@/lib/renault';
import { DashboardSkeletons } from '@/components/ui/Skeleton';
import VehicleCard from './VehicleCard';
import type { DashboardVehicle } from './types';

interface DtVehicleResultsProps {
    visible: DashboardVehicle[];
    /** Nombre total de véhicules de la DT, avant filtres. */
    totalCount: number;
    /** Premier chargement de la Vue DT : squelettes. */
    initialLoading: boolean;
    /** Recalcul en cours : résultats précédents atténués. */
    busy: boolean;
    error: string | null;
    /** Période refusée : aucun calcul, pas de résultats. */
    periodInvalid: boolean;
    activeFilters: { key: string; label: string; onRemove: () => void }[];
    renaultData: Record<string, RenaultVehicleData>;
    onRetry: () => void;
    onReset: () => void;
}

/** Grille de la Vue DT et ses états : chargement, recalcul, erreur, vides. */
export default function DtVehicleResults(props: DtVehicleResultsProps) {
    const { visible, totalCount, initialLoading, busy, error, periodInvalid, activeFilters } = props;

    if (periodInvalid) return null;

    if (error) {
        return (
            <div className="empty-state" role="alert">
                <div className="empty-state-title">Impossible de charger les disponibilités.</div>
                <p style={{ marginBottom: 16 }}>{error}</p>
                <button type="button" className="btn btn-secondary" onClick={props.onRetry}>Réessayer</button>
            </div>
        );
    }

    if (initialLoading) {
        return (
            <div role="status" aria-label="Chargement des véhicules…">
                <DashboardSkeletons count={6} />
            </div>
        );
    }

    if (totalCount === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">🚗</div>
                <p>Aucun véhicule n&apos;est rattaché aux UL de cette Direction Territoriale.</p>
            </div>
        );
    }

    if (visible.length === 0) {
        return (
            <div className="empty-state" aria-busy={busy}>
                <div className="empty-state-icon">🚗</div>
                <div className="empty-state-title">Aucun véhicule ne correspond.</div>
                {activeFilters.length > 0 && (
                    <div className="filters-bar" role="group" aria-label="Filtres actifs" style={{ justifyContent: 'center', marginBottom: 12 }}>
                        {activeFilters.map((f) => (
                            <button
                                key={f.key}
                                type="button"
                                className="filter-btn"
                                onClick={f.onRemove}
                                aria-label={`Retirer le filtre ${f.label}`}
                            >
                                {f.label} <span aria-hidden="true">✕</span>
                            </button>
                        ))}
                    </div>
                )}
                <button type="button" className="btn btn-secondary" onClick={props.onReset}>Réinitialiser les filtres</button>
            </div>
        );
    }

    return (
        <div
            className="vehicle-grid"
            data-tour="vehicle-card"
            aria-busy={busy}
            style={{ opacity: busy ? 0.5 : 1, transition: 'opacity var(--transition-fast)' }}
        >
            {visible.map((vehicle, index) => (
                <VehicleCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    isDtView
                    renaultData={props.renaultData[vehicle.name]}
                    isFirst={index === 0}
                />
            ))}
        </div>
    );
}
