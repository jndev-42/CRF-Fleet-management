'use client';

import Link from 'next/link';
import { Car } from 'lucide-react';
import type { FleetDossierDetail } from '@/lib/fleetTracking/dossiers';
import { LINK_TYPE_LABELS, type TaskLink } from '@/lib/fleetTracking/tasks';
import { cleanPhoneNumber } from '@/lib/fleetTracking/contacts';
import styles from './dossiers.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    dossier: FleetDossierDetail;
}

/** Objets rattachés aux tâches du dossier (hors son véhicule), sans doublon. */
export function dossierLinkedObjects(dossier: FleetDossierDetail): TaskLink[] {
    const seen = new Set<string>([`VEHICLE:${dossier.vehicle.id}`]);
    const out: TaskLink[] = [];
    for (const t of dossier.tasks) {
        for (const l of t.links) {
            const key = `${l.type}:${l.id}`;
            if (l.missing || seen.has(key)) continue;
            seen.add(key);
            out.push(l);
        }
    }
    return out;
}

/** Colonne latérale du détail : véhicule du dossier (lien vers sa fiche) et objets rattachés à ses tâches. */
export default function DossierLinks({ dossier }: Props) {
    const linked = dossierLinkedObjects(dossier);
    return (
        <aside className={styles.detailSide}>
            <section className={styles.card} aria-labelledby="dossier-vehicle-title">
                <h3 id="dossier-vehicle-title" className={styles.cardTitle}>Véhicule</h3>
                <div className={styles.vehicle}>
                    <Car size={20} aria-hidden="true" />
                    <div>
                        <div className={styles.itemLabel}>{dossier.vehicle.name}</div>
                        {dossier.vehicle.plate && <div className={styles.rowMeta}>{dossier.vehicle.plate}</div>}
                    </div>
                </div>
                {!dossier.vehicle.missing && (
                    <Link className={taskStyles.chipLink} href={`/vehicles/${encodeURIComponent(dossier.vehicle.name)}`}>Fiche véhicule →</Link>
                )}
            </section>
            {linked.length > 0 && (
                <section className={styles.card} aria-labelledby="dossier-links-title">
                    <h3 id="dossier-links-title" className={styles.cardTitle}>Rattaché à</h3>
                    <ul className={styles.items}>
                        {linked.map(l => (
                            <li key={`${l.type}:${l.id}`} className={styles.linkRow}>
                                <span className={styles.rowMeta}>{LINK_TYPE_LABELS[l.type]}</span>
                                <span>{l.label}{l.detail ? ` (${l.detail})` : ''}</span>
                                {l.phone && (
                                    <a className={taskStyles.chipLink} href={`tel:${cleanPhoneNumber(l.phone)}`} aria-label={`Appeler ${l.label}`}>{l.phone}</a>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </aside>
    );
}
