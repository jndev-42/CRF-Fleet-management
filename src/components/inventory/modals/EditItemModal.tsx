'use client';

import { useState } from 'react';
import { InventoryItem } from '@/app/inventory/types';

interface EditItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (updated: InventoryItem) => void;
    item: InventoryItem;
}

export default function EditItemModal({ isOpen, onClose, onSuccess, item }: EditItemModalProps) {
    const [form, setForm] = useState({
        name: item.itemName,
        sku: item.sku ?? '',
        category: item.category ?? '',
        quantity: item.quantity,
        unit: item.unit,
        expiryDate: item.expiryDate ?? '',
        status: item.status,
        criticalThreshold: item.criticalThreshold != null ? String(item.criticalThreshold) : '',
    });
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSubmitting(true);

        const payload: Record<string, unknown> = {
            name: form.name,
            quantity: Number(form.quantity),
            unit: form.unit,
            status: form.status,
            category: form.category.trim() || null,
            sku: form.sku.trim() || null,
            expiryDate: form.expiryDate || null,
            criticalThreshold: form.criticalThreshold ? Number(form.criticalThreshold) : null,
        };

        try {
            const res = await fetch(`/api/inventory/items/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const updated = await res.json() as InventoryItem;
                onSuccess(updated);
            } else {
                const data = await res.json() as { error?: string };
                alert(data.error || 'Erreur lors de la mise à jour');
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
                    <h2 className="modal-title">Modifier l&apos;article</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Nom *</label>
                                <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Référence (SKU)</label>
                                <input className="form-input" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Catégorie</label>
                                <input className="form-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Statut</label>
                                <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as typeof form.status })}>
                                    <option value="OK">OK</option>
                                    <option value="HORS_SERVICE">Hors service</option>
                                    <option value="MANQUANT">Manquant</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Quantité *</label>
                                <input type="number" min="0" className="form-input" value={form.quantity} onChange={e => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Unité</label>
                                <input className="form-input" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Date de péremption</label>
                                <input type="date" className="form-input" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Seuil critique (qté min.)</label>
                                <input type="number" min="0" className="form-input" value={form.criticalThreshold} onChange={e => setForm({ ...form, criticalThreshold: e.target.value })} placeholder="ex: 5" />
                            </div>
                        </div>
                        <div className="form-group">
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                                Pour changer la localisation de cet article, utilisez le bouton &quot;Transférer&quot;.
                            </p>
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
