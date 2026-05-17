'use client';

import { useState } from 'react';

interface AddItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const DEFAULT_FORM = {
    name: '',
    category: '',
    quantity: 0,
    notes: '',
};

export default function AddItemModal({ isOpen, onClose, onSuccess }: AddItemModalProps) {
    const [form, setForm] = useState(DEFAULT_FORM);
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        try {
            const res = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    quantity: Number(form.quantity)
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
                    <h2 className="modal-title">Créer un nouvel article</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Nom *</label>
                            <input
                                className="form-input"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                required
                                placeholder="ex: Pansements stériles"
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Catégorie</label>
                                <input
                                    className="form-input"
                                    value={form.category}
                                    onChange={e => setForm({ ...form, category: e.target.value })}
                                    placeholder="ex: Consommable"
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Quantité initiale</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="form-input"
                                    value={form.quantity}
                                    onChange={e => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Notes</label>
                            <textarea
                                className="form-input"
                                value={form.notes}
                                onChange={e => setForm({ ...form, notes: e.target.value })}
                                style={{ minHeight: '80px' }}
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Création...' : 'Créer l\'article'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
