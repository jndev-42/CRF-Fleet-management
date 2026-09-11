'use client';

import { useState, useEffect } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface StockModalProps {
    isOpen: boolean;
    mode: 'create' | 'rename' | 'duplicate';
    initialName?: string;
    /** Nom du stock copié — affiché en lecture seule en mode `duplicate`. */
    sourceStockName?: string;
    onClose: () => void;
    onSubmit: (name: string, options?: { copyStock: boolean }) => Promise<void>;
}

export default function StockModal({ isOpen, mode, initialName = '', sourceStockName, onClose, onSubmit }: StockModalProps) {
    useEscapeKey(onClose, isOpen);
    const [name, setName] = useState(initialName);
    const [copyStock, setCopyStock] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            setCopyStock(false);
            setError('');
        }
        // `mode` figure dans les dépendances bien qu'il ne soit pas lu : le composant
        // reste monté entre deux ouvertures, et sans lui un recâblage futur qui rouvrirait
        // la modale dans un autre mode sans changer `initialName` conserverait `copyStock`.
    }, [isOpen, initialName, mode]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Le nom du stock est requis');
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            await onSubmit(name.trim(), { copyStock });
            onClose();
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('Une erreur est survenue');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 110 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <div className="modal-header">
                    <h2 className="modal-title">
                        {mode === 'create' && '➕ Créer un nouveau stock'}
                        {mode === 'rename' && '✏️ Renommer le stock'}
                        {mode === 'duplicate' && '⧉ Dupliquer le stock'}
                    </h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {error && (
                            <div style={{
                                background: 'var(--error-bg)',
                                color: 'var(--error-text)',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                marginBottom: '16px',
                                fontSize: '0.9rem',
                            }}>
                                {error}
                            </div>
                        )}

                        {mode === 'duplicate' && sourceStockName && (
                            <div className="form-group">
                                <label className="form-label">Stock source</label>
                                <div style={{
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.95rem',
                                }}>
                                    📦 {sourceStockName}
                                </div>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Nom du stock *</label>
                            <input
                                className="form-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="ex: Stock Véhicules, Réserve Pharmacie..."
                                autoFocus
                                required
                            />
                        </div>

                        {mode === 'duplicate' && (
                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={copyStock}
                                        onChange={e => setCopyStock(e.target.checked)}
                                        style={{ marginTop: '3px' }}
                                    />
                                    <span>
                                        Copier le stock actuel (quantités + dates de péremption)
                                        <span style={{
                                            display: 'block',
                                            color: 'var(--text-secondary)',
                                            fontSize: '0.85rem',
                                            marginTop: '2px',
                                        }}>
                                            Sinon, seuls les articles sont copiés, avec une quantité à zéro.
                                            L&apos;historique des mouvements n&apos;est jamais copié.
                                        </span>
                                    </span>
                                </label>
                            </div>
                        )}
                    </div>
                    <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 24px' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting
                                ? 'Enregistrement...'
                                : mode === 'create'
                                    ? 'Créer le stock'
                                    : mode === 'duplicate'
                                        ? 'Dupliquer'
                                        : 'Renommer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
