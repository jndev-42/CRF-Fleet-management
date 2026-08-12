'use client';

import { useState, useEffect } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface StockModalProps {
    isOpen: boolean;
    mode: 'create' | 'rename';
    initialName?: string;
    onClose: () => void;
    onSubmit: (name: string) => Promise<void>;
}

export default function StockModal({ isOpen, mode, initialName = '', onClose, onSubmit }: StockModalProps) {
    useEscapeKey(onClose, isOpen);
    const [name, setName] = useState(initialName);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            setError('');
        }
    }, [isOpen, initialName]);

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
            await onSubmit(name.trim());
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
                        {mode === 'create' ? '➕ Créer un nouveau stock' : '✏️ Renommer le stock'}
                    </h2>
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
                    </div>
                    <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 24px' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Enregistrement...' : mode === 'create' ? 'Créer le stock' : 'Renommer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
