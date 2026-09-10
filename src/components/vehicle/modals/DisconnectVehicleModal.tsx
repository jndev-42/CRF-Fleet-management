import React, { useState } from 'react';
import { Unlink } from 'lucide-react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface DisconnectVehicleModalProps {
    /** UUID du véhicule — `vehicle.id`, JAMAIS `params.id` qui vaut le nom du véhicule. */
    vehicleId: string;
    vehicleName: string;
    onClose: () => void;
    onDisconnected: () => void;
}

/**
 * Confirme le retrait de la connexion marque d'un véhicule.
 *
 * Distinct de `DeleteConfirmationModal`, qui supprime le véhicule lui-même : ici seule la
 * ligne `VehicleConnection` disparaît. Le compte constructeur de l'UL n'est pas touché,
 * les autres véhicules qui le partagent restent connectés.
 */
export default function DisconnectVehicleModal({
    vehicleId,
    vehicleName,
    onClose,
    onDisconnected,
}: DisconnectVehicleModalProps) {
    useEscapeKey(onClose);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleDisconnect() {
        if (submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/vehicles/${vehicleId}/connection`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Erreur lors de la déconnexion du véhicule');
            }
            onDisconnected();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erreur lors de la déconnexion du véhicule');
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="disconnect-vehicle-title"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: 440 }}
            >
                <div className="modal-header">
                    <h2 id="disconnect-vehicle-title" className="modal-title">
                        <Unlink size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                        Déconnecter le véhicule
                    </h2>
                    <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
                </div>

                <div className="modal-body">
                    {error && (
                        <div
                            role="alert"
                            style={{
                                marginBottom: 16,
                                padding: '10px 12px',
                                background: 'var(--status-maintenance-bg)',
                                border: '1px solid rgba(239,68,68,0.4)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--error-text)',
                                fontSize: 13,
                            }}
                        >
                            {error}
                        </div>
                    )}
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                        <strong>{vehicleName}</strong> ne remontera plus son kilométrage ni son niveau
                        d&apos;énergie automatiquement. Le compte constructeur de l&apos;unité locale est
                        conservé : les autres véhicules connectés ne sont pas affectés.
                    </p>
                </div>

                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                        Annuler
                    </button>
                    <button type="button" className="btn btn-danger" onClick={handleDisconnect} disabled={submitting}>
                        {submitting ? 'Déconnexion…' : 'Déconnecter'}
                    </button>
                </div>
            </div>
        </div>
    );
}
