'use client';

import { useState } from 'react';
import { InvStock } from '@/app/inventory/types';

interface LocationOption {
    id: string;
    name: string;
    type: string;
}

interface TransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    item: InvStock;
    locations: LocationOption[];
    userRoles: string[];
}

export default function TransferModal({ isOpen, onClose, onSuccess, item, locations, userRoles }: TransferModalProps) {
    const [toLocationId, setToLocationId] = useState('');
    const [qty, setQty] = useState(1);
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const isAdmin = userRoles.includes('ADMIN');

    // Destinations disponibles (exclut l'emplacement source)
    const availableDestinations = locations.filter(loc => {
        if (loc.id === item.locationId) return false;
        // Non-admin ne peut pas transférer vers STOCK_CENTRAL
        if (!isAdmin && loc.type === 'STOCK_CENTRAL') return false;
        return true;
    });

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        try {
            const res = await fetch('/api/inventory/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transferType: 'item',
                    itemId: item.itemId,
                    fromLocationId: item.locationId,
                    toLocationId,
                    qty: Number(qty),
                    note: note.trim() || undefined,
                }),
            });
            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json() as { error?: string };
                alert(data.error || 'Erreur lors du transfert');
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
                    <h2 className="modal-title">Transférer l&apos;article</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div style={{ marginBottom: 16 }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                                <strong>{item.itemName}</strong> — actuellement :&nbsp;
                                <em>{item.locationName}</em>
                                &nbsp;({item.quantity} {item.unit} disponible{item.quantity > 1 ? 's' : ''})
                            </span>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Quantité à transférer *</label>
                                <input
                                    type="number"
                                    min="1"
                                    max={item.quantity}
                                    className="form-input"
                                    value={qty}
                                    onChange={e => setQty(parseInt(e.target.value) || 1)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Destination *</label>
                            <select
                                className="form-select"
                                value={toLocationId}
                                onChange={e => setToLocationId(e.target.value)}
                                required
                            >
                                <option value="">Sélectionner une destination...</option>
                                {availableDestinations.map(loc => (
                                    <option key={loc.id} value={loc.id}>
                                        {loc.name}
                                        {loc.type === 'SAC' ? ' (sac)' : loc.type === 'VEHICLE' ? ' (véhicule)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Note (optionnel)</label>
                            <input
                                className="form-input"
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                placeholder="Motif du transfert..."
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Transfert...' : 'Confirmer le transfert'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
