'use client';

import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import {
    CLOSE_REASONS,
    CLOSE_REASON_LABELS,
    DOSSIER_STATUS_LABELS,
    isDossierActive,
    type DossierCloseReason,
    type DossierStatus,
    type FleetDossierDetail,
} from '@/lib/fleetTracking/dossiers';
import styles from './dossiers.module.css';

interface Props {
    dossier: Pick<FleetDossierDetail, 'status' | 'closeReason'>;
    busy: boolean;
    /** Envoie la modification (statut, motif de clôture) au serveur. */
    onPatch: (body: Record<string, unknown>) => void;
}

const ACTIVE_STATUSES: DossierStatus[] = ['NEW', 'OPEN', 'WAITING'];

/**
 * Statut d'un dossier : Nouveau / En cours / En attente tant qu'il est ouvert ; « Clore »
 * demande un motif obligatoire ; « Rouvrir » remet le dossier En cours (motif effacé).
 */
export default function DossierStatusControl({ dossier, busy, onPatch }: Props) {
    const [closing, setClosing] = useState(false);
    const [reason, setReason] = useState<DossierCloseReason | ''>('');

    if (!isDossierActive(dossier.status)) {
        return (
            <>
                {dossier.closeReason && (
                    <span className={styles.closeReason}>Motif : {CLOSE_REASON_LABELS[dossier.closeReason]}</span>
                )}
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onPatch({ status: 'OPEN' })}>
                    <RotateCcw size={16} aria-hidden="true" /> Rouvrir le dossier
                </button>
            </>
        );
    }

    if (closing) {
        return (
            <span className={styles.closeForm}>
                <label htmlFor="dossier-close-reason" className={styles.closeLabel}>Motif de clôture</label>
                <select
                    id="dossier-close-reason"
                    className="form-select"
                    value={reason}
                    onChange={e => setReason(e.target.value as DossierCloseReason | '')}
                >
                    <option value="">Choisir un motif…</option>
                    {CLOSE_REASONS.map(r => <option key={r} value={r}>{CLOSE_REASON_LABELS[r]}</option>)}
                </select>
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !reason}
                    onClick={() => {
                        onPatch({ status: 'CLOSED', closeReason: reason });
                        // Le formulaire repart à zéro : une réouverture ne le fait pas réapparaître.
                        setClosing(false);
                        setReason('');
                    }}
                >
                    <Check size={16} aria-hidden="true" /> Confirmer la clôture
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setClosing(false)}>
                    Annuler
                </button>
            </span>
        );
    }

    return (
        <>
            <select
                className="form-select"
                aria-label="Statut du dossier"
                value={dossier.status}
                disabled={busy}
                onChange={e => onPatch({ status: e.target.value })}
            >
                {ACTIVE_STATUSES.map(s => <option key={s} value={s}>{DOSSIER_STATUS_LABELS[s]}</option>)}
            </select>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setClosing(true)}>
                <Check size={16} aria-hidden="true" /> Clore le dossier
            </button>
        </>
    );
}
