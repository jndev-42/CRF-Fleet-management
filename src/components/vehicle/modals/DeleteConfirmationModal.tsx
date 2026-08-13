import React, { useState } from 'react';
import { Vehicle } from '@/app/vehicles/[id]/types';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface DeleteConfirmationModalProps {
    vehicle: Vehicle;
    onClose: () => void;
    onSuccess: () => void;
}

/**
 * Confirmation modal before permanently deleting a vehicle 
 * and its trip history from the database.
 */
export default function DeleteConfirmationModal({ vehicle, onClose, onSuccess }: DeleteConfirmationModalProps) {
    useEscapeKey(onClose);
    const [confirmName, setConfirmName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const isMatch = confirmName === vehicle.name;

    async function handleDelete(e: React.FormEvent) {
        e.preventDefault();
        if (!isMatch) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/vehicles/${encodeURIComponent(vehicle.name)}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de la suppression');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title" style={{ color: 'var(--status-maintenance)' }}>⚠️ Supprimer {vehicle.name}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleDelete}>
                    <div className="modal-body">
                        <p style={{ marginBottom: 16 }}>
                            Êtes-vous sûr de vouloir supprimer définitivement le véhicule <strong>{vehicle.name}</strong> ?<br />
                            Cette action supprimera également tout l&apos;historique de ses trajets ({vehicle.trips.length} trajets associés).
                        </p>
                        <div className="form-group">
                            <label className="form-label" style={{ color: 'var(--status-maintenance)' }}>
                                Veuillez taper <strong>{vehicle.name}</strong> pour confirmer :
                            </label>
                            <input
                                className="form-input"
                                value={confirmName}
                                onChange={(e) => setConfirmName(e.target.value)}
                                placeholder={vehicle.name}
                                style={{ borderColor: isMatch ? 'var(--status-available)' : 'var(--border-primary)' }}
                                required
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                            Annuler
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ background: 'var(--status-maintenance)', opacity: (!isMatch || submitting) ? 0.5 : 1 }}
                            disabled={!isMatch || submitting}
                        >
                            {submitting ? 'Suppression...' : 'Confirmer la suppression'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
