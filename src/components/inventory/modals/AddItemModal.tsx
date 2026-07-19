'use client';

import { useState } from 'react';

interface AddItemModalProps {
    isOpen: boolean;
    stockId?: string;
    onClose: () => void;
    onSuccess: () => void;
}

const DEFAULT_FORM = {
    name: '',
    category: '',
    quantity: 0,
    minStock: '',
    expiryDate: '',
    notes: '',
};

const CATEGORY_OPTIONS = ['Consommable', 'Matériel', 'Médicament', 'Protection', 'Pansements', 'Oxygénothérapie'];

export default function AddItemModal({ isOpen, stockId, onClose, onSuccess }: AddItemModalProps) {
    const [form, setForm] = useState(DEFAULT_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        try {
            const res = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    quantity: Number(form.quantity),
                    stockId,
                }),
            });
            if (res.ok) {
                setForm(DEFAULT_FORM);
                onSuccess();
                onClose();
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error || 'Erreur lors de la création');
            }
        } catch {
            setError('Erreur de connexion');
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
                        {error && (
                            <div style={{
                                background: 'var(--danger-bg, #fee2e2)',
                                color: 'var(--danger, #dc2626)',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                marginBottom: '16px',
                                fontSize: '0.9rem',
                            }}>
                                {error}
                            </div>
                        )}

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

                        <div className="form-group">
                            <label className="form-label">Type / Catégorie</label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                {CATEGORY_OPTIONS.map(opt => (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => setForm({ ...form, category: opt })}
                                        style={{
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            border: '1.5px solid',
                                            borderColor: form.category === opt ? 'var(--primary, #2563eb)' : 'var(--border, #e2e8f0)',
                                            background: form.category === opt ? 'var(--primary, #2563eb)' : 'transparent',
                                            color: form.category === opt ? '#fff' : 'inherit',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontWeight: 500,
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                            <input
                                className="form-input"
                                value={form.category}
                                onChange={e => setForm({ ...form, category: e.target.value })}
                                placeholder="Ou saisir une catégorie personnalisée..."
                            />
                        </div>

                        <div className="form-row" style={{ display: 'flex', gap: '12px' }}>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Quantité initiale</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="form-input"
                                    value={form.quantity}
                                    onChange={e => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">Date de péremption (Optionnel)</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={form.expiryDate}
                                    onChange={e => setForm({ ...form, expiryDate: e.target.value })}
                                    disabled={form.quantity <= 0}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Stock minimum (Optionnel)</label>
                            <input
                                type="number"
                                min="0"
                                className="form-input"
                                value={form.minStock}
                                onChange={e => setForm({ ...form, minStock: e.target.value })}
                                placeholder="ex: 10 — alerte si stock en dessous"
                            />
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
