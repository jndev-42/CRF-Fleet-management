'use client';

import { useState, type FormEvent } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { MAX_DOSSIER_DESCRIPTION, MAX_DOSSIER_TITLE, type FleetDossier } from '@/lib/fleetTracking/dossiers';
import type { LinkTarget } from '@/lib/fleetTracking/tasks';
import { DOSSIERS_URL } from './useFleetDossiers';
import { readError } from './useFleetContacts';
import { useModalFocus } from './useModalFocus';
import styles from './tasks.module.css';

interface Props {
    /** `null` : création. */
    dossier: FleetDossier | null;
    /** Véhicules de l'UL proposés (création seulement). */
    vehicles: LinkTarget[];
    /** Véhicule imposé (création depuis la fiche véhicule). */
    fixedVehicle?: { id: string; name: string };
    onClose: () => void;
    /** Enregistré : identifiant du dossier. */
    onSaved: (dossierId: string) => void;
}

/** Modale de création ou de modification d'un dossier : titre, véhicule, description, épingle. */
export default function DossierModal({ dossier, vehicles, fixedVehicle, onClose, onSaved }: Props) {
    const [title, setTitle] = useState(dossier?.title ?? '');
    const [vehicleId, setVehicleId] = useState(fixedVehicle?.id ?? dossier?.vehicle.id ?? '');
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
        if (!vehicleId) return setError('Choisissez le véhicule concerné');
        setSaving(true);
        setError(null);
        try {
            const body: Record<string, unknown> = { title: title.trim(), description: description.trim() || null, pinned };
            // Le véhicule est fixé à la création (l'API refuse de le changer ensuite).
            if (!dossier) body.vehicleId = vehicleId;
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

    const lockedVehicle = fixedVehicle?.name ?? dossier?.vehicle.name;

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
                        <div className="form-group">
                            <label className="form-label" htmlFor="dossier-vehicle">Véhicule *</label>
                            {lockedVehicle !== undefined ? (
                                <>
                                    <input id="dossier-vehicle" className="form-input" value={lockedVehicle} readOnly />
                                    {dossier && <span className={styles.hint}>Le véhicule d&apos;un dossier ne change pas après sa création.</span>}
                                </>
                            ) : (
                                <select id="dossier-vehicle" className="form-select" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                                    <option value="">Choisir un véhicule</option>
                                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                                </select>
                            )}
                        </div>
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
