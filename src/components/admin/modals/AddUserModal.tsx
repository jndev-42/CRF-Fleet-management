'use client';

import { useState, useEffect } from 'react';
import type { ULEntry } from '../types';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface AddUserModalProps {
    availableRoles: string[];
    availableULs: ULEntry[];
    userUlId?: string;
    onClose: () => void;
    onSuccess: (email: string, name: string, roles: string[], ulId: string | null) => Promise<void>;
}

export default function AddUserModal({
    availableRoles,
    availableULs,
    userUlId,
    onClose,
    onSuccess
}: AddUserModalProps) {
    useEscapeKey(onClose);
    const initialUlId = userUlId && availableULs.some(u => u.id === userUlId)
        ? userUlId
        : (availableULs.length > 0 ? availableULs[0].id : '');
    const [form, setForm] = useState({ email: '', name: '', ulId: initialUlId });
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!form.ulId) {
            if (userUlId && availableULs.some(u => u.id === userUlId)) {
                setForm(f => ({ ...f, ulId: userUlId }));
            } else if (availableULs.length > 0) {
                setForm(f => ({ ...f, ulId: availableULs[0].id }));
            }
        }
    }, [userUlId, availableULs, form.ulId]);

    function toggleRole(role: string) {
        setSelectedRoles(prev =>
            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
        );
    }

    async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setSubmitting(true);
        try {
            await onSuccess(form.email.trim(), form.name.trim(), selectedRoles, form.ulId || null);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">➕ Ajouter un utilisateur</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Email *</label>
                            <input
                                className="form-input"
                                type="email"
                                placeholder="prenom.nom@croix-rouge.fr"
                                value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })}
                                required
                                autoFocus
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Nom complet *</label>
                            <input
                                className="form-input"
                                type="text"
                                placeholder="Prénom NOM"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Unité Locale principale</label>
                            <select
                                className="form-input"
                                value={form.ulId}
                                onChange={e => setForm({ ...form, ulId: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-primary)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    outline: 'none',
                                    fontSize: '14px',
                                }}
                            >
                                <option value="">— default —</option>
                                {availableULs.map(ul => (
                                    <option key={ul.id} value={ul.id}>
                                        Unité Locale {ul.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Rôles initiaux (optionnel)</label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                                {availableRoles.map(role => {
                                    const active = selectedRoles.includes(role);
                                    return (
                                        <label key={role} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: active ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${active ? '#3B82F6' : 'var(--border-primary)'}`,
                                            borderRadius: '100px',
                                            padding: '4px 10px',
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                            color: active ? '#60A5FA' : 'var(--text-secondary)',
                                            transition: 'all 0.2s',
                                            userSelect: 'none'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={active}
                                                onChange={() => toggleRole(role)}
                                                style={{ display: 'none' }}
                                            />
                                            {role}
                                        </label>
                                    );
                                })}
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                                ℹ️ Les rôles peuvent être modifiés après la création.
                            </p>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Création...' : '✅ Créer l\'utilisateur'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
