'use client';

import { useState, useEffect, useCallback } from 'react';
import { InvBagTemplate } from '@/app/inventory/types';
import BagTemplateModal from './BagTemplateModal';

interface BagTemplateListModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function BagTemplateListModal({ isOpen, onClose }: BagTemplateListModalProps) {
    const [templates, setTemplates] = useState<InvBagTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editTarget, setEditTarget] = useState<InvBagTemplate | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchTemplates = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/inventory/bag-templates');
            if (res.ok) {
                const data = await res.json() as { templates: InvBagTemplate[] };
                setTemplates(data.templates);
            } else {
                setError('Impossible de charger les modèles');
            }
        } catch {
            setError('Erreur de connexion');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchTemplates();
        }
    }, [isOpen, fetchTemplates]);

    if (!isOpen) return null;

    async function handleDelete(template: InvBagTemplate) {
        if (!window.confirm(`Supprimer le modèle "${template.name}" ?\n\nLes sacs qui utilisent ce modèle seront détachés.`)) return;
        setDeletingId(template.id);
        try {
            const res = await fetch(`/api/inventory/bag-templates/${template.id}`, { method: 'DELETE' });
            if (res.ok) {
                await fetchTemplates();
            } else {
                const data = await res.json() as { error?: string };
                alert(data.error || 'Erreur lors de la suppression');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <>
            <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                    <div className="modal-header">
                        <h2 className="modal-title">Modèles de contenu de sac</h2>
                        <button className="modal-close" onClick={onClose}>✕</button>
                    </div>

                    <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                        {loading && (
                            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p>
                        )}

                        {!loading && error && (
                            <p style={{ color: 'var(--status-maintenance)', fontSize: 13 }}>{error}</p>
                        )}

                        {!loading && !error && templates.length === 0 && (
                            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 14 }}>
                                Aucun modèle créé pour l&apos;instant.
                            </p>
                        )}

                        {!loading && templates.map(tpl => (
                            <div
                                key={tpl.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '10px 0',
                                    borderBottom: '1px solid var(--border-primary)',
                                }}
                            >
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontWeight: 600, fontSize: 14 }}>{tpl.name}</span>
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                                        {tpl.itemCount} article{tpl.itemCount !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: 12, padding: '3px 10px' }}
                                    onClick={() => setEditTarget(tpl)}
                                >
                                    Modifier
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: 12, padding: '3px 10px', color: 'var(--status-maintenance)' }}
                                    disabled={deletingId === tpl.id}
                                    onClick={() => handleDelete(tpl)}
                                >
                                    {deletingId === tpl.id ? '...' : 'Supprimer'}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                            + Nouveau modèle
                        </button>
                    </div>
                </div>
            </div>

            {showCreate && (
                <BagTemplateModal
                    isOpen
                    onClose={() => setShowCreate(false)}
                    onSuccess={() => { setShowCreate(false); fetchTemplates(); }}
                />
            )}

            {editTarget && (
                <BagTemplateModal
                    isOpen
                    onClose={() => setEditTarget(null)}
                    onSuccess={() => { setEditTarget(null); fetchTemplates(); }}
                    templateId={editTarget.id}
                    initialName={editTarget.name}
                />
            )}
        </>
    );
}
