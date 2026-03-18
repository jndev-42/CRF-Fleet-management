'use client';

import { useState } from 'react';
import { InventoryItem, InventoryLot } from '@/app/inventory/types';

interface EditLotModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    lot: InventoryLot;
}

const DEFAULT_NEW_ITEM = {
    name: '',
    quantity: 1,
    unit: 'unité',
    category: '',
    expiryDate: '',
    criticalThreshold: '',
};

export default function EditLotModal({ isOpen, onClose, onSuccess, lot }: EditLotModalProps) {
    const [newItem, setNewItem] = useState(DEFAULT_NEW_ITEM);
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);

    if (!isOpen) return null;

    const items: InventoryItem[] = lot.items ?? [];

    async function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!newItem.name.trim()) return;
        setAdding(true);
        try {
            const payload: Record<string, unknown> = {
                name: newItem.name.trim(),
                quantity: Number(newItem.quantity),
                unit: newItem.unit,
                lotId: lot.id,
            };
            if (newItem.category.trim()) payload.category = newItem.category.trim();
            if (newItem.expiryDate) payload.expiryDate = newItem.expiryDate;
            if (newItem.criticalThreshold) payload.criticalThreshold = Number(newItem.criticalThreshold);

            const res = await fetch('/api/inventory/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setNewItem(DEFAULT_NEW_ITEM);
                onSuccess();
            } else {
                const data = await res.json() as { error?: string };
                alert(data.error || 'Erreur lors de l\'ajout');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setAdding(false);
        }
    }

    async function handleRemoveItem(itemId: string) {
        if (!window.confirm('Retirer cet article du lot ?')) return;
        setRemoving(itemId);
        try {
            // Move item to the lot's current location (vehicle or stock)
            const payload: Record<string, unknown> = { lotId: null };
            if (lot.vehicleId) payload.vehicleId = lot.vehicleId;
            else payload.stockLocation = lot.stockLocation ?? 'STOCK_CENTRAL';

            await fetch(`/api/inventory/items/${itemId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            onSuccess();
        } catch {
            alert('Erreur de connexion');
        } finally {
            setRemoving(null);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="modal-header">
                    <h2 className="modal-title">Contenu du lot : {lot.name}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {/* Current items */}
                    {items.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24, fontSize: 14 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-primary)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                                    <th style={{ padding: '6px 8px' }}>Article</th>
                                    <th style={{ padding: '6px 8px' }}>Qté actuelle</th>
                                    <th style={{ padding: '6px 8px' }}>Qté attendue</th>
                                    <th style={{ padding: '6px 8px' }}>Catégorie</th>
                                    <th style={{ padding: '6px 8px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => {
                                    const low = item.criticalThreshold != null && item.quantity < item.criticalThreshold;
                                    return (
                                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border-primary)', background: low ? 'var(--status-maintenance-bg, rgba(239,68,68,0.06))' : undefined }}>
                                        <td style={{ padding: '8px' }}>{item.itemName}</td>
                                        <td style={{ padding: '8px', fontWeight: low ? 700 : undefined, color: low ? 'var(--status-maintenance)' : undefined }}>
                                            {item.quantity} {item.unit}
                                        </td>
                                        <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>
                                            {item.criticalThreshold != null ? `${item.criticalThreshold} ${item.unit}` : '—'}
                                        </td>
                                        <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{item.category ?? '—'}</td>
                                        <td style={{ padding: '8px', textAlign: 'right' }}>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ fontSize: 12, padding: '2px 8px', color: 'var(--status-maintenance)' }}
                                                disabled={removing === item.id}
                                                onClick={() => handleRemoveItem(item.id)}
                                            >
                                                Retirer
                                            </button>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 14, marginBottom: 24 }}>
                            Ce lot est vide.
                        </p>
                    )}

                    {/* Add new item to lot */}
                    <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 16 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
                            Ajouter un article dans ce lot
                        </h3>
                        <form onSubmit={handleAddItem}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Nom *</label>
                                    <input className="form-input" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Catégorie</label>
                                    <input className="form-input" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Qté actuelle *</label>
                                    <input type="number" min="0" className="form-input" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Qté attendue</label>
                                    <input type="number" min="0" className="form-input" value={newItem.criticalThreshold} onChange={e => setNewItem({ ...newItem, criticalThreshold: e.target.value })} placeholder="ex: 5" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Unité</label>
                                    <input className="form-input" value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Péremption</label>
                                    <input type="date" className="form-input" value={newItem.expiryDate} onChange={e => setNewItem({ ...newItem, expiryDate: e.target.value })} />
                                </div>
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={adding} style={{ fontSize: 13 }}>
                                {adding ? 'Ajout...' : '+ Ajouter'}
                            </button>
                        </form>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                </div>
            </div>
        </div>
    );
}
