'use client';

import { useState, useEffect } from 'react';
import { InvItem } from '@/app/inventory/types';

interface LocationOption {
    id: string;
    name: string;
    type: string;
}

interface AddItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    locations: LocationOption[];
}

const DEFAULT_FORM = {
    name: '',
    itemId: '',
    category: '',
    unit: 'unité',
    quantity: 1,
    expiryDate: '',
    status: 'OK' as 'OK' | 'HORS_SERVICE' | 'MANQUANT',
    criticalThreshold: '',
    locationId: '',
};

export default function AddItemModal({ isOpen, onClose, onSuccess, locations }: AddItemModalProps) {
    const [form, setForm] = useState(DEFAULT_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [catalog, setCatalog] = useState<InvItem[]>([]);
    const [useExisting, setUseExisting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        fetch('/api/inventory/items')
            .then(r => r.json())
            .then((data: { items?: InvItem[] }) => setCatalog(Array.isArray(data.items) ? data.items : []))
            .catch(console.error);
    }, [isOpen]);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        const payload: Record<string, unknown> = {
            locationId: form.locationId,
            quantity: Number(form.quantity),
            status: form.status,
        };

        if (useExisting && form.itemId) {
            payload.itemId = form.itemId;
        } else {
            payload.name = form.name;
            if (form.category.trim()) payload.category = form.category.trim();
            if (form.unit.trim()) payload.unit = form.unit.trim();
        }

        if (form.expiryDate) payload.expiryDate = form.expiryDate;
        if (form.criticalThreshold) payload.criticalThreshold = Number(form.criticalThreshold);

        try {
            const res = await fetch('/api/inventory/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setForm(DEFAULT_FORM);
                setUseExisting(false);
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
                    <h2 className="modal-title">Ajouter du stock</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {/* Choix article existant ou nouveau */}
                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                                <input
                                    type="checkbox"
                                    checked={useExisting}
                                    onChange={e => setUseExisting(e.target.checked)}
                                    style={{ width: 16, height: 16 }}
                                />
                                <span style={{ fontSize: 14 }}>Choisir un article du catalogue</span>
                            </label>
                        </div>

                        {useExisting ? (
                            <div className="form-group">
                                <label className="form-label">Article catalogue *</label>
                                <select
                                    className="form-select"
                                    value={form.itemId}
                                    onChange={e => setForm({ ...form, itemId: e.target.value })}
                                    required
                                >
                                    <option value="">Sélectionner un article...</option>
                                    {catalog.map(item => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}{item.category ? ` — ${item.category}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="form-row">
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
                                    <label className="form-label">Catégorie</label>
                                    <input
                                        className="form-input"
                                        value={form.category}
                                        onChange={e => setForm({ ...form, category: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Quantité *</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="form-input"
                                    value={form.quantity}
                                    onChange={e => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Unité</label>
                                <input
                                    className="form-input"
                                    value={form.unit}
                                    onChange={e => setForm({ ...form, unit: e.target.value })}
                                    placeholder="unité"
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Statut</label>
                                <select
                                    className="form-select"
                                    value={form.status}
                                    onChange={e => setForm({ ...form, status: e.target.value as typeof form.status })}
                                >
                                    <option value="OK">OK</option>
                                    <option value="HORS_SERVICE">Hors service</option>
                                    <option value="MANQUANT">Manquant</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Seuil critique</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="form-input"
                                    value={form.criticalThreshold}
                                    onChange={e => setForm({ ...form, criticalThreshold: e.target.value })}
                                    placeholder="ex: 5"
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Date de péremption</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={form.expiryDate}
                                    onChange={e => setForm({ ...form, expiryDate: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Emplacement *</label>
                            <select
                                className="form-select"
                                value={form.locationId}
                                onChange={e => setForm({ ...form, locationId: e.target.value })}
                                required
                            >
                                <option value="">Sélectionner un emplacement...</option>
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>
                                        {loc.name}
                                        {loc.type === 'SAC' ? ' (sac)' : loc.type === 'VEHICLE' ? ' (véhicule)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Ajout...' : 'Ajouter le stock'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
