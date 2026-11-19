'use client';

import { useState, type FormEvent } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { MAX_DOSSIER_DESCRIPTION, MAX_DOSSIER_TITLE, type FleetDossier } from '@/lib/fleetTracking/dossiers';
import type { LinkTarget } from '@/lib/fleetTracking/tasks';
import VehicleChecklist from './VehicleChecklist';
import { DOSSIERS_URL } from './useFleetDossiers';
import { readError } from './useFleetContacts';
import { useUlVehicles } from './useFleetTasks';
import { useModalFocus } from './useModalFocus';
import styles from './tasks.module.css';

interface Props {
    /** `null` : création. */
    dossier: FleetDossier | null;
    /** Véhicules de l'UL proposés ; absent : la modale les charge elle-même. */
    vehicles?: LinkTarget[];
    /** Création : véhicules cochés d'office (filtre de l'onglet, fiche véhicule). */
    initialVehicleIds?: string[];
    onClose: () => void;
    /** Enregistré : identifiant du dossier. */
    onSaved: (dossierId: string) => void;
}

/** Même liste d'identifiants, dans le même ordre. */
function sameIds(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Modale de création ou de modification d'un dossier : titre, véhicules, description, épingle. */
export default function DossierModal({ dossier, vehicles: provided, initialVehicleIds = [], onClose, onSaved }: Props) {
    const { vehicles, loading: vehiclesLoading } = useUlVehicles(provided);
    const [title, setTitle] = useState(dossier?.title ?? '');
    const initialIds = dossier ? dossier.vehicles.map(v => v.id) : initialVehicleIds.filter(Boolean);
    const [vehicleIds, setVehicleIds] = useState<string[]>(initialIds);
    const [description, setDescription] = useState(dossier?.description ?? '');
    const [pinned, setPinned] = useState(dossier?.pinned ?? false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestClose = () => {
        if (!saving) onClose();
    };
    const dialogRef = useModalFocus<HTMLDivElement>(requestClose);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return setError('Le titre est requis');
        if (vehicleIds.length === 0) return setError('Choisissez au moins un véhicule');
        setSaving(true);
        setError(null);
        try {
            const body: Record<string, unknown> = { title: title.trim(), description: description.trim() || null, pinned };
            // En modification, la liste n'est envoyée que si elle a changé.
            if (!dossier || !sameIds(vehicleIds, initialIds)) body.vehicleIds = vehicleIds;
            const res = await fetch(dossier ? `${DOSSIERS_URL}/${encodeURIComponent(dossier.id)}` : DOSSIERS_URL, {
                method: dossier ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                setError(await readError(res, 'Enregistrement impossible'));
                return;
            }
            const data = await res.json() as { id?: string };
            onSaved(dossier?.id ?? data.id ?? '');
        } catch {
            setError('Enregistrement impossible');
        } finally {
            setSaving(false);
        }
    };

    // Véhicules du dossier partis de l'UL : affichés pour pouvoir les retirer.
    const departed = dossier?.vehicles.filter(v => v.missing) ?? [];

    return (
        <div className="modal-overlay" onClick={requestClose}>
            <div ref={dialogRef} className={`modal ${styles.modal}`} role="dialog" aria-modal="true" aria-labelledby="dossier-modal-title" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 id="dossier-modal-title" className="modal-title">{dossier ? 'Modifier le dossier' : 'Nouveau dossier'}</h2>
                    <button type="button" className="modal-close" onClick={requestClose} disabled={saving} aria-label="Fermer la modale">✕</button>
                </div>
                <form onSubmit={e => void handleSubmit(e)} noValidate>
                    <div className="modal-body">
                        <button type="button" className={`btn btn-secondary ${styles.pinToggle}`} aria-pressed={pinned} onClick={() => setPinned(p => !p)}>
                            {pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
                            {pinned ? 'Désépingler' : 'Épingler'}
                        </button>
                        <div className="form-group">
                            <label className="form-label" htmlFor="dossier-title">Titre *</label>
                            <input id="dossier-title" data-autofocus className="form-input" value={title} maxLength={MAX_DOSSIER_TITLE}
                                placeholder="Sinistre roue arrière droite" required onChange={e => setTitle(e.target.value)} />
                        </div>
                        <VehicleChecklist vehicles={vehicles} extra={departed} value={vehicleIds}
                            onChange={setVehicleIds} loading={vehiclesLoading} />
                        <div className="form-group">
                            <label className="form-label" htmlFor="dossier-description">Description</label>
                            <textarea id="dossier-description" className="form-input" rows={4} value={description}
                                maxLength={MAX_DOSSIER_DESCRIPTION} onChange={e => setDescription(e.target.value)} />
                        </div>
                        {error && <p role="alert" className={styles.error}>{error}</p>}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={requestClose} disabled={saving}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
