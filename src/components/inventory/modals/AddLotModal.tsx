'use client';

import { useState } from 'react';

interface AddLotModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    vehicles: { id: string; name: string }[];
}

const DEFAULT_FORM = {
    name: '',
    description: '',
    isSealed: false,
    locationType: 'STOCK_CENTRAL' as 'STOCK_CENTRAL' | 'PHARMA_TAMPON' | 'vehicle',
    vehicleId: '',
};

export default function AddLotModal({ isOpen, onClose, onSuccess, vehicles }: AddLotModalProps) {
    const [form, setForm] = useState(DEFAULT_FORM);
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        const payload: Record<string, unknown> = {
            name: form.name,
            isSealed: form.isSealed,
        };
        if (form.description.trim()) payload.description = form.description.trim();

        if (form.locationType === 'vehicle') {
            payload.vehicleId = form.vehicleId;
        } else {
            payload.stockLocation = form.locationType;
        }

        try {
            const res = await fetch('/api/inventory/lots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
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
                    <h2 className="modal-title">Créer un lot</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Nom du lot *</label>
                            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="ex: Sac PSE1" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea className="form-textarea" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description du contenu..." />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                                <input type="checkbox" checked={form.isSealed} onChange={e => setForm({ ...form, isSealed: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--crf-red)' }} />
                                <span style={{ fontSize: 14, fontWeight: 500 }}>Lot scellé (vérification globale sans détail)</span>
                            </label>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Localisation *</label>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                                {(['STOCK_CENTRAL', 'PHARMA_TAMPON', 'vehicle'] as const).map(loc => (
                                    <label key={loc} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                        <input type="radio" name="locationType" value={loc} checked={form.locationType === loc} onChange={() => setForm({ ...form, locationType: loc })} />
                                        {loc === 'STOCK_CENTRAL' ? 'Stock Central' : loc === 'PHARMA_TAMPON' ? 'Pharma Tampon' : 'Véhicule'}
                                    </label>
                                ))}
                            </div>
                            {form.locationType === 'vehicle' && (
                                <select className="form-select" style={{ marginTop: 8 }} value={form.vehicleId} onChange={e => setForm({ ...form, vehicleId: e.target.value })} required>
                                    <option value="">Sélectionner un véhicule...</option>
                                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                            )}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Création...' : 'Créer le lot'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
