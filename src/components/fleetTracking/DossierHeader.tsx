'use client';

import { useState } from 'react';
import { Check, Pencil, Pin, PinOff, RotateCcw, Trash2 } from 'lucide-react';
import { DOSSIER_STATUS_LABELS, dossierVehicleNames, type FleetDossierDetail } from '@/lib/fleetTracking/dossiers';
import { formatFrDate } from '@/lib/fleetTracking/tasks';
import { DOSSIERS_URL } from './useFleetDossiers';
import { readError } from './useFleetContacts';
import styles from './dossiers.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    dossier: FleetDossierDetail;
    /** Dossier renvoyé par l'API après une modification. */
    onReplace: (dossier: FleetDossierDetail) => void;
    onEdit: () => void;
    onDeleted: () => void;
}

/** En-tête d'un dossier : état, véhicules, épingle, Modifier, Clore / Rouvrir, Supprimer. */
export default function DossierHeader({ dossier, onReplace, onEdit, onDeleted }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const url = `${DOSSIERS_URL}/${encodeURIComponent(dossier.id)}`;

    const patch = async (body: Record<string, unknown>) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) {
                setError(await readError(res, 'Enregistrement impossible'));
                return;
            }
            onReplace((await res.json() as { dossier: FleetDossierDetail }).dossier);
        } catch {
            setError('Enregistrement impossible');
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        const detail = 'Ses pièces à récupérer et ses pièces jointes seront supprimées ; ses tâches sont conservées, hors dossier.';
        if (!window.confirm(`Supprimer définitivement le dossier « ${dossier.title} » ?\n\n${detail}`)) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(url, { method: 'DELETE' });
            if (!res.ok && res.status !== 404) {
                setError(await readError(res, 'Suppression impossible'));
                return;
            }
            onDeleted();
        } catch {
            setError('Suppression impossible');
        } finally {
            setBusy(false);
        }
    };

    const open = dossier.status === 'OPEN';
    return (
        <header className={styles.header}>
            <div className={styles.headerMeta}>
                <span className={`${styles.status} ${styles[`status_${dossier.status}`]}`}>{DOSSIER_STATUS_LABELS[dossier.status]}</span>
                <span>{dossier.vehicles.length === 1 && dossier.vehicles[0].plate
                    ? `${dossier.vehicles[0].name} · ${dossier.vehicles[0].plate}`
                    : dossierVehicleNames(dossier)}</span>
                {dossier.pinned && <span className={styles.pinned}><Pin size={14} aria-hidden="true" /> Épinglé</span>}
            </div>
            <h2 className={styles.title}>{dossier.title}</h2>
            <p className={taskStyles.dim}>
                Ouvert le {formatFrDate(dossier.createdAt)}{dossier.createdByName ? ` par ${dossier.createdByName}` : ''}
                {dossier.closedAt ? ` · clos le ${formatFrDate(dossier.closedAt)}` : ''}
            </p>
            {dossier.description && <p className={styles.description}>{dossier.description}</p>}
            <div className={styles.actions}>
                <button type="button" className="btn btn-secondary" aria-pressed={dossier.pinned} disabled={busy} onClick={() => void patch({ pinned: !dossier.pinned })}>
                    {dossier.pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
                    {dossier.pinned ? 'Désépingler' : 'Épingler'}
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={onEdit}>
                    <Pencil size={16} aria-hidden="true" /> Modifier
                </button>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void patch({ status: open ? 'CLOSED' : 'OPEN' })}>
                    {open ? <Check size={16} aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}
                    {open ? 'Clore le dossier' : 'Rouvrir le dossier'}
                </button>
                <button type="button" className={`btn btn-secondary ${taskStyles.danger}`} disabled={busy} onClick={() => void remove()}>
                    <Trash2 size={16} aria-hidden="true" /> Supprimer
                </button>
            </div>
            {error && <p role="alert" className={taskStyles.error}>{error}</p>}
        </header>
    );
}
