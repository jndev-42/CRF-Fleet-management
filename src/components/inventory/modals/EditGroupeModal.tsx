'use client';

import { useState, useEffect } from 'react';
import { InvGroupe, InvLocation } from '@/app/inventory/types';

interface EditGroupeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    groupe: InvGroupe;
    availableSacs: InvLocation[];
}

export default function EditGroupeModal({ isOpen, onClose, onSuccess, groupe, availableSacs }: EditGroupeModalProps) {
    const [name, setName] = useState(groupe.name);
    const [description, setDescription] = useState(groupe.description ?? '');
    const [members, setMembers] = useState<InvLocation[]>(groupe.sacs ?? []);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [addSacId, setAddSacId] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`/api/inventory/lots/${groupe.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || null,
                }),
            });
            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error || 'Erreur lors de la mise à jour');
            }
        } catch {
            setError('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleRemoveMember(sacId: string) {
        setError(null);
        try {
            const res = await fetch(`/api/inventory/lots/${groupe.id}/members/${sacId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                setMembers(prev => prev.filter(m => m.id !== sacId));
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error || 'Erreur lors du retrait du sac');
            }
        } catch {
            setError('Erreur de connexion');
        }
    }

    async function handleAddMember() {
        if (!addSacId) return;
        setError(null);

        try {
            const res = await fetch(`/api/inventory/lots/${groupe.id}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locationId: addSacId }),
            });
            if (res.ok) {
                const sac = availableSacs.find(s => s.id === addSacId);
                if (sac) {
                    setMembers(prev => [...prev, sac]);
                }
                setAddSacId('');
            } else {
                const data = await res.json() as { error?: string };
                setError(data.error || 'Erreur lors de l\'ajout du sac');
            }
        } catch {
            setError('Erreur de connexion');
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div className="modal-header">
                    <h2 className="modal-title">Modifier le groupe</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

                    {/* Section 1 — Identité */}
                    <form id="edit-groupe-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">Nom du groupe *</label>
                            <input
                                className="form-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-textarea"
                                rows={2}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Description du groupe..."
                            />
                        </div>
                        {error && (
                            <p style={{ color: 'var(--status-maintenance)', fontSize: 13, marginTop: 4 }}>
                                {error}
                            </p>
                        )}
                    </form>

                    {/* Section 2 — Sacs membres */}
                    <div style={{ marginTop: 24 }}>
                        <p className="form-label" style={{ marginBottom: 8 }}>Sacs membres</p>

                        {members.length === 0 && (
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                Aucun sac dans ce groupe.
                            </p>
                        )}

                        {members.map(sac => (
                            <div key={sac.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-primary)' }}>
                                <span style={{ flex: 1, fontSize: 14 }}>{sac.name}</span>
                                <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: 12, padding: '2px 8px', color: 'var(--status-maintenance)' }}
                                    onClick={() => handleRemoveMember(sac.id)}
                                >
                                    Retirer
                                </button>
                            </div>
                        ))}

                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            <select
                                value={addSacId}
                                onChange={e => setAddSacId(e.target.value)}
                                style={{
                                    flex: 1,
                                    fontSize: 14,
                                    padding: '6px 10px',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-primary)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                }}
                            >
                                <option value="">— Ajouter un sac —</option>
                                {availableSacs
                                    .filter(s => !members.some(m => m.id === s.id))
                                    .map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))
                                }
                            </select>
                            <button
                                className="btn btn-secondary"
                                disabled={!addSacId}
                                onClick={handleAddMember}
                            >
                                Ajouter
                            </button>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Fermer</button>
                    <button type="submit" form="edit-groupe-form" className="btn btn-primary" disabled={submitting || !name.trim()}>
                        {submitting ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                </div>
            </div>
        </div>
    );
}
