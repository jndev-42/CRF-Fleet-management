'use client';

import { useState, useEffect } from 'react';
import { InvBagTemplate } from '@/app/inventory/types';

interface EditSacModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (updated: { id: string; name: string }) => void;
    sac: { id: string; name: string; templateId?: string | null };
    userRoles?: string[];
}

export default function EditSacModal({ isOpen, onClose, onSuccess, sac, userRoles = [] }: EditSacModalProps) {
    const [name, setName] = useState(sac.name);
    const [templateId, setTemplateId] = useState<string>(sac.templateId ?? '');
    const [templates, setTemplates] = useState<InvBagTemplate[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isAdmin = userRoles.includes('ADMIN');

    useEffect(() => {
        if (!isOpen) {
            setError(null);
            return;
        }
        setName(sac.name);
        setTemplateId(sac.templateId ?? '');

        if (isAdmin) {
            fetch('/api/inventory/bag-templates')
                .then(r => r.json())
                .then((data: { templates?: InvBagTemplate[] }) => {
                    setTemplates(Array.isArray(data.templates) ? data.templates : []);
                })
                .catch(console.error);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, sac.id]);

    if (!isOpen) return null;

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;

        setSubmitting(true);
        setError(null);

        try {
            const body: Record<string, unknown> = { name: trimmed };
            if (isAdmin) {
                body.templateId = templateId || null;
            }

            const res = await fetch(`/api/inventory/sacs/${sac.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const updated = await res.json() as { id: string; name: string };
                onSuccess(updated);
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

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <div className="modal-header">
                    <h2 className="modal-title">Modifier le sac</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Nom du sac *</label>
                            <input
                                className="form-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                        {isAdmin && (
                            <div className="form-group">
                                <label className="form-label">Modèle de contenu</label>
                                <select
                                    className="form-select"
                                    value={templateId}
                                    onChange={e => setTemplateId(e.target.value)}
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
                        {error && (
                            <p style={{ fontSize: 13, color: 'var(--status-maintenance)', margin: '8px 0 0' }}>
                                {error}
                            </p>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
                            {submitting ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
