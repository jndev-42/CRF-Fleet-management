'use client';

import { useState } from 'react';

interface InvItem {
    id: string;
    name: string;
    category: string | null;
    notes: string | null;
}

interface EditItemModalProps {
    isOpen: boolean;
    item: InvItem | null;
    onClose: () => void;
    onSuccess: () => void;
}

const CATEGORY_OPTIONS = ['Consommable', 'Matériel', 'Médicament', 'Protection', 'Pansements', 'Oxygénothérapie', 'Général'];

export default function EditItemModal({ isOpen, item, onClose, onSuccess }: EditItemModalProps) {
    const [name, setName] = useState(item?.name ?? '');
    const [category, setCategory] = useState(item?.category ?? '');
    const [notes, setNotes] = useState(item?.notes ?? '');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Sync state when item changes
    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!item) return;
        setSubmitting(true);
        setError('');

        try {
            const res = await fetch('/api/inventory', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: item.id,
                    name,
                    category,
                    notes,
                }),
            });
            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error || 'Erreur lors de la modification');
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
                    <h2 className="modal-title">Modifier l&apos;article</h2>
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
                                value={name}
                                onChange={e => setName(e.target.value)}
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
                                        onClick={() => setCategory(opt)}
                                        style={{
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            border: '1.5px solid',
                                            borderColor: category === opt ? 'var(--primary, #2563eb)' : 'var(--border, #e2e8f0)',
                                            background: category === opt ? 'var(--primary, #2563eb)' : 'transparent',
                                            color: category === opt ? '#fff' : 'inherit',
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
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                placeholder="Ou saisir une catégorie personnalisée..."
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Notes</label>
                            <textarea
                                className="form-input"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                style={{ minHeight: '80px' }}
                                placeholder="Informations complémentaires..."
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
