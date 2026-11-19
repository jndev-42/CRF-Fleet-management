'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Wrench } from 'lucide-react';
import { canManageVehicles } from '@/lib/roles';
import { dossierDeepLink, isHistoryEntryActive } from '@/lib/fleetTracking/dossiers';
import { taskDeepLink } from '@/lib/fleetTracking/tasks';
import DossierListItem from '@/components/fleetTracking/DossierListItem';
import DossierModal from '@/components/fleetTracking/DossierModal';
import HistoryTaskItem from './HistoryTaskItem';
import { useVehicleFleetHistory } from './useVehicleFleetHistory';
import styles from '@/components/fleetTracking/dossiers.module.css';
import taskStyles from '@/components/fleetTracking/tasks.module.css';

interface Props {
    vehicleName: string;
    userRoles: string[];
    /** Vue DT ou véhicule d'une autre UL : section masquée. */
    isDtView: boolean;
}

type Filter = 'all' | 'active' | 'closed';

/**
 * Section « Suivi technique » de la fiche véhicule (écran 8, CAP-13) : dossiers
 * (ouverts et clos) et tâches hors dossier du véhicule, du plus récent au plus
 * ancien, filtre Tout / En cours / Clos-terminé, bouton « + Dossier pour ce
 * véhicule ». Réservée aux `canManageVehicles`, jamais en Vue DT.
 */
export default function VehicleFleetHistory({ vehicleName, userRoles, isDtView }: Props) {
    const visible = canManageVehicles(userRoles) && !isDtView;
    if (!visible) return null;
    return <VehicleFleetHistoryContent vehicleName={vehicleName} />;
}

function VehicleFleetHistoryContent({ vehicleName }: { vehicleName: string }) {
    const router = useRouter();
    const { history, refused, error } = useVehicleFleetHistory(vehicleName);
    const [filter, setFilter] = useState<Filter>('all');
    const [creating, setCreating] = useState(false);

    const entries = useMemo(() => history?.entries ?? [], [history]);
    const activeCount = entries.filter(isHistoryEntryActive).length;
    const shown = entries.filter(e => filter === 'all' || (filter === 'active') === isHistoryEntryActive(e));

    // Véhicule d'une autre UL (403) ou inconnu : rien à montrer.
    if (refused) return null;

    const filters: { value: Filter; label: string; count: number }[] = [
        { value: 'all', label: 'Tout', count: entries.length },
        { value: 'active', label: 'En cours', count: activeCount },
        { value: 'closed', label: 'Clos / terminé', count: entries.length - activeCount },
    ];

    return (
        <section className="detail-card" style={{ marginBottom: 24, padding: '20px' }} aria-labelledby="vehicle-fleet-history-title">
            <div className={styles.historyHeader}>
                <h2 id="vehicle-fleet-history-title" className="detail-card-title" style={{ margin: 0 }}>
                    <Wrench size={16} aria-hidden="true" /> Suivi technique
                </h2>
                {history && (
                    <button type="button" className="btn btn-secondary" onClick={() => setCreating(true)}>
                        <Plus size={16} aria-hidden="true" /> Dossier pour ce véhicule
                    </button>
                )}
            </div>
            {error ? (
                <p role="alert" className={taskStyles.error}>{error}</p>
            ) : !history ? (
                <p role="status" className={taskStyles.dim}>Chargement du suivi technique…</p>
            ) : (
                <>
                    <div className={styles.historyFilters} role="group" aria-label="Filtrer l'historique">
                        {filters.map(f => (
                            <button key={f.value} type="button" aria-pressed={filter === f.value}
                                className={`filter-btn${filter === f.value ? ' active' : ''}`} onClick={() => setFilter(f.value)}>
                                {f.label} ({f.count})
                            </button>
                        ))}
                    </div>
                    {shown.length === 0 ? (
                        <p className={taskStyles.dim}>{entries.length === 0 ? 'Aucun dossier ni tâche pour ce véhicule.' : 'Rien dans cette catégorie.'}</p>
                    ) : (
                        <ul className={styles.list}>
                            {shown.map(e => (e.kind === 'DOSSIER'
                                ? <DossierListItem key={`d-${e.dossier.id}`} dossier={e.dossier} hideVehicle onOpen={() => router.push(dossierDeepLink(e.dossier.id))} />
                                : <HistoryTaskItem key={`t-${e.task.id}`} task={e.task} onOpen={() => router.push(taskDeepLink(e.task.id))} />))}
                        </ul>
                    )}
                </>
            )}
            {creating && history && (
                <DossierModal
                    dossier={null}
                    initialVehicleIds={[history.vehicle.id]}
                    onClose={() => setCreating(false)}
                    onSaved={id => {
                        setCreating(false);
                        router.push(dossierDeepLink(id));
                    }}
                />
            )}
        </section>
    );
}
