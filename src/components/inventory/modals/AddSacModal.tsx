'use client';

import { useState, useEffect } from 'react';
import { InvBagTemplate } from '@/app/inventory/types';

interface AddSacModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    vehicles: { id: string; name: string }[];
    defaultParentLocationId?: string;
    userRoles?: string[];
}

interface InvLocationOption {
    id: string;
    name: string;
    type: string;
}

const DEFAULT_FORM = {
    name: '',
    parentLocationId: '',
    isSealed: false,
    templateId: '',
};

export default function AddSacModal({ isOpen, onClose, onSuccess, vehicles, defaultParentLocationId, userRoles = [] }: AddSacModalProps) {
    const [form, setForm] = useState({ ...DEFAULT_FORM, parentLocationId: defaultParentLocationId ?? '' });
    const [submitting, setSubmitting] = useState(false);
    const [vehicleLocations, setVehicleLocations] = useState<InvLocationOption[]>([]);
    const [templates, setTemplates] = useState<InvBagTemplate[]>([]);

    const isAdmin = userRoles.includes('ADMIN');

    useEffect(() => {
        if (!isOpen) return;

        // Construit la liste depuis les véhicules
        const locs: InvLocationOption[] = [
            { id: 'loc-pharma-tampon', name: 'Pharmacie Tampon', type: 'PHARMA_TAMPON' },
            ...vehicles.map(v => ({ id: `loc-veh-${v.id}`, name: v.name, type: 'VEHICLE' })),
        ];
        setVehicleLocations(locs);

        // Charge les modèles si ADMIN
        if (isAdmin) {
            fetch('/api/inventory/bag-templates')
                .then(r => r.json())
                .then((data: { templates?: InvBagTemplate[] }) => {
                    setTemplates(Array.isArray(data.templates) ? data.templates : []);
                })
                .catch(console.error);
        }
    }, [isOpen, vehicles, isAdmin]);

    useEffect(() => {
        if (defaultParentLocationId) {
            setForm(f => ({ ...f, parentLocationId: defaultParentLocationId }));
        }
    }, [defaultParentLocationId]);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        try {
            const body: Record<string, unknown> = {
                name: form.name,
                parentLocationId: form.parentLocationId,
                isSealed: form.isSealed,
            };
            if (isAdmin && form.templateId) {
                body.templateId = form.templateId;
            }

            const res = await fetch('/api/inventory/sacs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setForm({ ...DEFAULT_FORM, parentLocationId: defaultParentLocationId ?? '' });
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
                    <h2 className="modal-title">Créer un sac</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Nom du sac *</label>
                            <input
                                className="form-input"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                required
                                placeholder="ex: Sac PSE1"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Emplacement parent *</label>
                            <select
                                className="form-select"
                                value={form.parentLocationId}
                                onChange={e => setForm({ ...form, parentLocationId: e.target.value })}
                                required
                            >
                                <option value="">Sélectionner un emplacement...</option>
                                {vehicleLocations.map(loc => (
                                    <option key={loc.id} value={loc.id}>
                                        {loc.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {isAdmin && (
                            <div className="form-group">
                                <label className="form-label">Modèle de contenu</label>
                                <select
                                    className="form-select"
                                    value={form.templateId}
                                    onChange={e => setForm({ ...form, templateId: e.target.value })}
                                >
                                    <option value="">— Aucun modèle —</option>
                                    {templates.map(tpl => (
                                        <option key={tpl.id} value={tpl.id}>
                                            {tpl.name} ({tpl.itemCount} article{tpl.itemCount !== 1 ? 's' : ''})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="form-group">
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                cursor: 'pointer',
                                padding: '10px 14px',
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-primary)',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={form.isSealed}
                                    onChange={e => setForm({ ...form, isSealed: e.target.checked })}
                                    style={{ width: 18, height: 18, accentColor: 'var(--crf-red)' }}
                                />
                                <span style={{ fontSize: 14, fontWeight: 500 }}>Sac scellé (vérification globale sans détail)</span>
                            </label>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Création...' : 'Créer le sac'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
