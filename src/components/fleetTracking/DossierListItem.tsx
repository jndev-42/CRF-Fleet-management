'use client';

import { FolderOpen, Pin } from 'lucide-react';
import { CLOSE_REASON_LABELS, dossierSummary, dossierVehicleNames, DOSSIER_STATUS_LABELS, isDossierActive, type FleetDossier } from '@/lib/fleetTracking/dossiers';
import { formatFrDate } from '@/lib/fleetTracking/tasks';
import styles from './dossiers.module.css';

interface Props {
    dossier: FleetDossier;
    onOpen: () => void;
    /** Libellé du bouton (« Ouvrir » par défaut ; « Consulter » pour un dossier clos). */
    actionLabel?: string;
    /** Masque les véhicules (historique d'un véhicule). */
    hideVehicle?: boolean;
}

/** Ligne d'un dossier : état, titre, véhicules, dates et résumé (tâches en cours, pièces manquantes). */
export default function DossierListItem({ dossier: d, onOpen, actionLabel, hideVehicle = false }: Props) {
    const dates = d.status === 'CLOSED' && d.closedAt
        ? `${formatFrDate(d.createdAt)} → ${formatFrDate(d.closedAt)}`
        : `Ouvert le ${formatFrDate(d.createdAt)}`;
    const meta = [hideVehicle ? null : dossierVehicleNames(d), dates, d.closeReason ? CLOSE_REASON_LABELS[d.closeReason] : null, dossierSummary(d)].filter(Boolean).join(' · ');
    return (
        <li className={styles.row}>
            <span className={`${styles.status} ${styles[`status_${d.status}`]}`}>{DOSSIER_STATUS_LABELS[d.status]}</span>
            <FolderOpen size={18} aria-hidden="true" className={styles.rowIcon} />
            <div className={styles.rowMain}>
                <div className={styles.rowTitle}>
                    {d.title}
                    {d.pinned && <Pin size={14} aria-label="Épinglé" className={styles.pin} />}
                </div>
                <div className={styles.rowMeta}>{meta}</div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={onOpen} aria-label={`${actionLabel ?? (isDossierActive(d.status) ? 'Ouvrir' : 'Consulter')} le dossier ${d.title}`}>
                {actionLabel ?? (isDossierActive(d.status) ? 'Ouvrir' : 'Consulter')}
            </button>
        </li>
    );
}
