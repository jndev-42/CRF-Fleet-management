import React, { useState, useEffect } from 'react';
import UserCombobox from '@/components/ui/UserCombobox';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface DesinfPreCheckinModalProps {
    tripId: string;
    onClose: () => void;
    onConfirm: () => void;
}

/**
 * Modal allowing an ADMIN to pre-fill disinfection info (responsable + lot number)
 * before the actual vehicle check-in. Persists data to DB via API.
 */
export default function DesinfPreCheckinModal({ tripId, onClose, onConfirm }: DesinfPreCheckinModalProps) {
    useEscapeKey(onClose);
    const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
    const [responsableId, setResponsableId] = useState('');
    const [lotNumber, setLotNumber] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/users')
            .then(res => { if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`); return res.json(); })
            .then(data => { if (data.users) setUsers(data.users); })
            .catch(console.error);
    }, []);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const user = users.find(u => u.id === responsableId);
        const responsableName = user?.name || user?.email || '';
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/trips/${tripId}/desinf-pre`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ desinfResponsableId: responsableId, desinfResponsable: responsableName, desinfLotNumber: lotNumber.trim() }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError(d.error || 'Erreur lors de la sauvegarde');
                return;
            }
            onConfirm();
        } catch {
            setError('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-desinf-pre-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 id="modal-desinf-pre-title" className="modal-title">🧴 Informations de désinfection</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div
                            style={{
                                padding: '14px 16px',
                                background: 'rgba(16, 185, 129, 0.05)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                marginBottom: 20,
                                fontSize: 13,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            Saisissez les informations de désinfection avant le retour du véhicule. Elles seront pré-remplies lors du check-in.
                        </div>

                        {error && (
                            <div
                                style={{
                                    padding: '10px 14px',
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    marginBottom: 16,
                                    fontSize: 13,
                                    color: '#DC2626',
                                }}
                            >
                                {error}
                            </div>
                        )}

                        <div className="form-group" style={{ marginBottom: 16 }}>
                            <label className="form-label" htmlFor="pre-desinf-responsable">
                                Responsable de la désinf. *
                            </label>
                            <UserCombobox
                                users={users}
                                value={responsableId}
                                onChange={setResponsableId}
                                defaultLabel="— Sélectionner un responsable —"
                                placeholder="Rechercher..."
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="pre-desinf-lot">
                                Numéro de lot de désinf. *
                            </label>
                            <input
                                id="pre-desinf-lot"
                                className="form-input"
                                type="text"
                                placeholder="Ex : LOT-2026-001"
                                value={lotNumber}
                                onChange={e => setLotNumber(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Annuler
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={!responsableId || !lotNumber.trim() || submitting}
                        >
                            {submitting ? '...' : '✅ Valider'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
