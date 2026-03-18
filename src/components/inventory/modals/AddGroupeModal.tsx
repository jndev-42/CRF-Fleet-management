'use client';

import { useState } from 'react';

interface AddGroupeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const DEFAULT_FORM = {
    name: '',
    description: '',
};

export default function AddGroupeModal({ isOpen, onClose, onSuccess }: AddGroupeModalProps) {
    const [form, setForm] = useState(DEFAULT_FORM);
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        try {
            const res = await fetch('/api/inventory/lots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    description: form.description.trim() || undefined,
                }),
            });
            if (res.ok) {
                setForm(DEFAULT_FORM);
                onSuccess();
            } else {
                const data = await res.json() as { error?: string };
                alert(data.error || 'Erreur lors de la création');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Créer un groupe</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Nom du groupe *</label>
                            <input
                                className="form-input"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                required
                                placeholder="ex: Lot PSE1"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-textarea"
                                rows={2}
                                value={form.description}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder="Description du groupe..."
                            />
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                            Après création, vous pourrez ajouter des sacs à ce groupe.
                        </p>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Création...' : 'Créer le groupe'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
