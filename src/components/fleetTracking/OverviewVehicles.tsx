'use client';

import type { OverviewVehicle } from '@/lib/fleetTracking/overview';
import styles from './overview.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    vehicles: OverviewVehicle[];
    /** Ouvre l'onglet Dossiers filtré sur le véhicule. */
    onOpenVehicle: (vehicleId: string) => void;
}

/** Indicatif court : la fin du nom (« 75-188 » → « 188 »). */
function shortCode(name: string): string {
    const m = /(\d+)\s*$/.exec(name);
    return m ? m[1].slice(-3) : name.slice(0, 3);
}

/** « Les N véhicules » de l'UL, avec leur nombre de dossiers ouverts. */
export default function OverviewVehicles({ vehicles, onOpenVehicle }: Props) {
    const n = vehicles.length;
    return (
        <section className={`card ${styles.panel}`} aria-labelledby="overview-vehicles">
            <div className={styles.panelHead}>
                <h3 id="overview-vehicles" className={styles.panelTitle}>
                    {n === 0 ? 'Aucun véhicule' : `Les ${n} véhicule${n > 1 ? 's' : ''}`}
                </h3>
            </div>
            {n > 0 && (
                <ul className={styles.vehicleList}>
                    {vehicles.map(v => (
                        <li key={v.id}>
                            <button type="button" className={styles.vehicle} onClick={() => onOpenVehicle(v.id)}
                                aria-label={`${v.name} : ${v.openDossiers} dossier${v.openDossiers > 1 ? 's' : ''} ouvert${v.openDossiers > 1 ? 's' : ''} — voir ses dossiers`}>
                                <span className={styles.vehicleCode} aria-hidden="true">{shortCode(v.name)}</span>
                                <span className={styles.vehicleText}>
                                    <b>{v.name}</b>
                                    <small>{[v.model, v.plate].filter(Boolean).join(' · ') || '—'}</small>
                                </span>
                                <span className={`${taskStyles.pill}${v.openDossiers > 0 ? ` ${styles.pillAlert}` : ''}`}>
                                    {v.openDossiers} dossier{v.openDossiers > 1 ? 's' : ''}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
