'use client';

import { useState, useEffect } from 'react';
import { InvBagTemplateDetail, InvItem } from '@/app/inventory/types';

interface BagTemplateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    /** Si fourni, mode édition. Sinon, mode création. */
    templateId?: string;
    initialName?: string;
}

interface EntryRow {
    itemId: string;
    itemName: string;
    unit: string;
    targetQty: number;
}

export default function BagTemplateModal({ isOpen, onClose, onSuccess, templateId, initialName }: BagTemplateModalProps) {
    const [name, setName] = useState(initialName ?? '');
    const [entries, setEntries] = useState<EntryRow[]>([]);
    const [catalog, setCatalog] = useState<InvItem[]>([]);
    const [addItemId, setAddItemId] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEdit = !!templateId;

    useEffect(() => {
        if (!isOpen) return;
        setError(null);

        // Charge le catalogue
        fetch('/api/inventory/items')
            .then(r => r.json())
            .then((data: { items?: InvItem[] }) => {
                setCatalog(Array.isArray(data.items) ? data.items : []);
            })
            .catch(console.error);

        // En mode édition, charge les entrées existantes
        if (isEdit && templateId) {
            setLoading(true);
            fetch(`/api/inventory/bag-templates/${templateId}`)
                .then(r => r.json())
                .then((data: InvBagTemplateDetail) => {
                    setName(data.name);
                    setEntries(data.entries.map(e => ({
                        itemId: e.itemId,
                        itemName: e.itemName,
                        unit: e.unit,
                        targetQty: e.targetQty,
                    })));
                })
                .catch(console.error)
                .finally(() => setLoading(false));
        } else {
            setName(initialName ?? '');
            setEntries([]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, templateId]);

    if (!isOpen) return null;

    function handleAddItem() {
        if (!addItemId) return;
        if (entries.some(e => e.itemId === addItemId)) return;
        const item = catalog.find(i => i.id === addItemId);
        if (!item) return;
        setEntries(prev => [...prev, { itemId: item.id, itemName: item.name, unit: item.unit, targetQty: 1 }]);
        setAddItemId('');
    }

    function handleRemoveEntry(itemId: string) {
        setEntries(prev => prev.filter(e => e.itemId !== itemId));
    }

    function handleQtyChange(itemId: string, qty: number) {
        setEntries(prev => prev.map(e => e.itemId === itemId ? { ...e, targetQty: Math.max(1, qty) } : e));
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        const payload = {
            name: name.trim(),
            entries: entries.map(e => ({ itemId: e.itemId, targetQty: e.targetQty })),
        };

        try {
            const url = isEdit ? `/api/inventory/bag-templates/${templateId}` : '/api/inventory/bag-templates';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error || 'Erreur lors de la sauvegarde');
            }
        } catch {
            setError('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    const availableItems = catalog.filter(i => !entries.some(e => e.itemId === i.id));

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 110 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
                <div className="modal-header">
                    <h2 className="modal-title">
                        {isEdit ? 'Modifier le modèle' : 'Nouveau modèle de sac'}
                    </h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                        {loading && (
                            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p>
                        )}

                        {!loading && (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Nom du modèle *</label>
                                    <input
                                        className="form-input"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        required
                                        placeholder="ex: PSE1 Standard"
                                        autoFocus={!isEdit}
                                    />
                                </div>

                                <div className="form-group" style={{ marginTop: 20 }}>
                                    <label className="form-label">Articles du modèle</label>

                                    {entries.length === 0 && (
                                        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8 }}>
                                            Aucun article ajouté pour l&apos;instant.
                                        </p>
                                    )}

                                    {entries.map(row => (
                                        <div
                                            key={row.itemId}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                padding: '6px 0',
                                                borderBottom: '1px solid var(--border-primary)',
                                            }}
                                        >
                                            <span style={{ flex: 1, fontSize: 14 }}>{row.itemName}</span>
                                            <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 40 }}>{row.unit}</span>
                                            <input
                                                type="number"
                                                min="1"
                                                value={row.targetQty}
                                                onChange={e => handleQtyChange(row.itemId, parseInt(e.target.value) || 1)}
                                                style={{
                                                    width: 60,
                                                    fontSize: 14,
                                                    padding: '3px 6px',
                                                    borderRadius: 4,
                                                    border: '1px solid var(--border-primary)',
                                                    background: 'var(--bg-secondary)',
                                                    color: 'var(--text-primary)',
                                                    textAlign: 'right',
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                style={{ fontSize: 12, padding: '2px 8px', color: 'var(--status-maintenance)' }}
                                                onClick={() => handleRemoveEntry(row.itemId)}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}

                                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                        <select
                                            className="form-select"
                                            value={addItemId}
                                            onChange={e => setAddItemId(e.target.value)}
                                            style={{ flex: 1 }}
                                        >
                                            <option value="">— Ajouter un article —</option>
                                            {availableItems.map(item => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name} ({item.unit})
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            disabled={!addItemId}
                                            onClick={handleAddItem}
                                        >
                                            Ajouter
                                        </button>
                                    </div>
                                </div>

                                {error && (
                                    <p style={{ color: 'var(--status-maintenance)', fontSize: 13, marginTop: 8 }}>
                                        {error}
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting || loading || !name.trim()}>
                            {submitting ? 'Enregistrement...' : isEdit ? 'Enregistrer' : 'Créer le modèle'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
