'use client';

import { useEffect, useState } from 'react';

export interface Banner {
    id: string;
    title: string | null;
    message: string;
    target_page: 'ALL' | 'VEHICLES' | 'MISSIONS' | 'INVENTORY';
    type: 'info' | 'warning' | 'danger' | 'success';
    ul_id: string | null;
    ul_name?: string | null;
    is_global: boolean;
    is_active: boolean;
    created_by?: string;
    created_by_name?: string | null;
    created_at?: string;
    updated_at?: string;
}

interface UL {
    id: string;
    name: string;
}

export default function BannersTab({
    isSuperAdmin = false,
    userUlId = '',
    showToast
}: {
    isSuperAdmin?: boolean;
    userUlId?: string;
    showToast: (message: string, type?: 'success' | 'error') => void;
}) {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [uls, setUls] = useState<UL[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [formTitle, setFormTitle] = useState('');
    const [formMessage, setFormMessage] = useState('');
    const [formTargetPage, setFormTargetPage] = useState<'ALL' | 'VEHICLES' | 'MISSIONS' | 'INVENTORY'>('ALL');
    const [formType, setFormType] = useState<'info' | 'warning' | 'danger' | 'success'>('info');
    const [formIsGlobal, setFormIsGlobal] = useState(false);
    const [formIsActive, setFormIsActive] = useState(true);
    const [formUlId, setFormUlId] = useState('');

    async function fetchBanners() {
        try {
            const res = await fetch('/api/banners?admin=true');
            if (res.ok) {
                const data = await res.json();
                setBanners(data.banners ?? []);
            } else {
                showToast('Erreur lors de la récupération des bandeaux', 'error');
            }
        } catch {
            showToast('Erreur de connexion', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function fetchULs() {
        if (!isSuperAdmin) return;
        try {
            const res = await fetch('/api/ul');
            if (res.ok) {
                const data = await res.json();
                setUls(data.uls ?? []);
            }
        } catch {
            // noop
        }
    }

    useEffect(() => {
        fetchBanners();
        fetchULs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleOpenModal(banner: Banner | null = null) {
        if (banner) {
            setEditingBanner(banner);
            setFormTitle(banner.title || '');
            setFormMessage(banner.message || '');
            setFormTargetPage(banner.target_page);
            setFormType(banner.type);
            setFormIsGlobal(banner.is_global);
            setFormIsActive(banner.is_active);
            setFormUlId(banner.ul_id || userUlId || '');
        } else {
            setEditingBanner(null);
            setFormTitle('');
            setFormMessage('');
            setFormTargetPage('ALL');
            setFormType('info');
            setFormIsGlobal(false);
            setFormIsActive(true);
            setFormUlId(userUlId || '');
        }
        setIsModalOpen(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!formMessage.trim()) {
            showToast('Le message du bandeau est obligatoire', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                title: formTitle.trim() || null,
                message: formMessage.trim(),
                target_page: formTargetPage,
                type: formType,
                is_global: isSuperAdmin ? formIsGlobal : false,
                is_active: formIsActive,
                ul_id: formIsGlobal ? null : (isSuperAdmin ? (formUlId || userUlId) : userUlId),
            };

            const url = editingBanner ? `/api/banners/${editingBanner.id}` : '/api/banners';
            const method = editingBanner ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                showToast(editingBanner ? 'Bandeau mis à jour avec succès' : 'Bandeau créé avec succès');
                setIsModalOpen(false);
                fetchBanners();
            } else {
                const data = await res.json();
                showToast(data.error || 'Erreur lors de l\'enregistrement', 'error');
            }
        } catch {
            showToast('Erreur lors de l\'enregistrement du bandeau', 'error');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleToggleActive(banner: Banner) {
        try {
            const res = await fetch(`/api/banners/${banner.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !banner.is_active }),
            });

            if (res.ok) {
                setBanners(prev => prev.map(b => b.id === banner.id ? { ...b, is_active: !b.is_active } : b));
                showToast(banner.is_active ? 'Bandeau désactivé' : 'Bandeau activé');
            } else {
                showToast('Erreur lors de la modification du statut', 'error');
            }
        } catch {
            showToast('Erreur lors de la modification du statut', 'error');
        }
    }

    async function handleDelete(banner: Banner) {
        if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce bandeau de communication ?')) return;

        try {
            const res = await fetch(`/api/banners/${banner.id}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                setBanners(prev => prev.filter(b => b.id !== banner.id));
                showToast('Bandeau supprimé avec succès');
            } else {
                const data = await res.json();
                showToast(data.error || 'Erreur lors de la suppression', 'error');
            }
        } catch {
            showToast('Erreur lors de la suppression du bandeau', 'error');
        }
    }

    const getTargetPageLabel = (tp: Banner['target_page']) => {
        switch (tp) {
            case 'ALL': return 'Partout (Toutes pages)';
            case 'VEHICLES': return 'Page Véhicules';
            case 'MISSIONS': return 'Page Missions';
            case 'INVENTORY': return 'Page Inventaire';
        }
    };

    const getTypeLabel = (type: Banner['type']) => {
        switch (type) {
            case 'info': return 'Information';
            case 'warning': return 'Avertissement';
            case 'danger': return 'Urgent / Danger';
            case 'success': return 'Succès';
        }
    };

    const getTypeStyle = (type: Banner['type']) => {
        switch (type) {
            case 'info': return { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' };
            case 'warning': return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' };
            case 'danger': return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' };
            case 'success': return { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' };
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '40px' }}>
                <div className="loading-spinner" />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Bandeaux de communication</h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                        Configurez les messages d&apos;information diffusés en haut de l&apos;application.
                    </p>
                </div>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleOpenModal()}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <span>➕ Nouveau bandeau</span>
                </button>
            </div>

            {banners.length === 0 ? (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--text-secondary)',
                }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📢</div>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>Aucun bandeau de communication</div>
                    <div style={{ fontSize: '13px', marginBottom: '16px' }}>
                        Créez un bandeau pour afficher un message d&apos;information à destination des bénévoles.
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => handleOpenModal()}>
                        Créer un bandeau
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {banners.map(banner => {
                        const style = getTypeStyle(banner.type);
                        return (
                            <div
                                key={banner.id}
                                style={{
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: 'var(--radius-lg)',
                                    padding: '16px 20px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px',
                                    opacity: banner.is_active ? 1 : 0.65,
                                    transition: 'opacity 0.2s',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        {/* Type badge */}
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '99px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            background: style.bg,
                                            color: style.color,
                                            border: `1px solid ${style.border}`,
                                        }}>
                                            {getTypeLabel(banner.type)}
                                        </span>

                                        {/* Scope badge */}
                                        {banner.is_global ? (
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '99px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                background: 'rgba(234, 179, 8, 0.18)',
                                                color: '#ca8a04',
                                                border: '1px solid rgba(234, 179, 8, 0.4)',
                                            }}>
                                                🌐 Commun (Toutes ULs)
                                            </span>
                                        ) : (
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '99px',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                background: 'var(--bg-tertiary)',
                                                color: 'var(--text-secondary)',
                                                border: '1px solid var(--border-primary)',
                                            }}>
                                                📍 UL : {banner.ul_name || banner.ul_id || 'Locale'}
                                            </span>
                                        )}

                                        {/* Target page badge */}
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '99px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            background: 'var(--bg-tertiary)',
                                            color: 'var(--text-primary)',
                                            border: '1px solid var(--border-primary)',
                                        }}>
                                            📄 {getTargetPageLabel(banner.target_page)}
                                        </span>

                                        {/* Active status */}
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '99px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            background: banner.is_active ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-tertiary)',
                                            color: banner.is_active ? '#22c55e' : 'var(--text-tertiary)',
                                        }}>
                                            {banner.is_active ? '● Actif' : '○ Inactif'}
                                        </span>
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleToggleActive(banner)}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '12px',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border-primary)',
                                                background: 'var(--bg-tertiary)',
                                                color: 'var(--text-primary)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {banner.is_active ? 'Désactiver' : 'Activer'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleOpenModal(banner)}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '12px',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid var(--border-primary)',
                                                background: 'var(--bg-tertiary)',
                                                color: 'var(--text-primary)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Éditer
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(banner)}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '12px',
                                                borderRadius: 'var(--radius-sm)',
                                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                color: '#ef4444',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Supprimer
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    {banner.title && (
                                        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>
                                            {banner.title}
                                        </div>
                                    )}
                                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                                        {banner.message}
                                    </div>
                                </div>

                                {banner.created_by_name && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                        Créé par {banner.created_by_name}
                                        {banner.created_at && ` le ${new Date(banner.created_at).toLocaleDateString('fr-FR')}`}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Form Modal */}
            {isModalOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1100,
                        padding: '16px',
                    }}
                    onClick={() => setIsModalOpen(false)}
                >
                    <div
                        style={{
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '24px',
                            maxWidth: '540px',
                            width: '100%',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                            {editingBanner ? 'Éditer le bandeau' : 'Créer un nouveau bandeau'}
                        </h3>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Titre optionnel */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                                    Titre (optionnel)
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Ex: Information importante"
                                    value={formTitle}
                                    onChange={e => setFormTitle(e.target.value)}
                                    maxLength={100}
                                />
                            </div>

                            {/* Message obligatoire */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                                    Message <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <textarea
                                    className="form-input"
                                    placeholder="Ex: Réunion d'équipe d'urgence ce vendredi à 19h au local."
                                    rows={3}
                                    value={formMessage}
                                    onChange={e => setFormMessage(e.target.value)}
                                    required
                                />
                            </div>

                            {/* Page cible & Type */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                                        Page cible
                                    </label>
                                    <select
                                        className="form-input"
                                        value={formTargetPage}
                                        onChange={e => setFormTargetPage(e.target.value as Banner['target_page'])}
                                    >
                                        <option value="ALL">Partout (Toutes pages)</option>
                                        <option value="VEHICLES">Page Véhicules</option>
                                        <option value="MISSIONS">Page Missions</option>
                                        <option value="INVENTORY">Page Inventaire</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                                        Style / Type
                                    </label>
                                    <select
                                        className="form-input"
                                        value={formType}
                                        onChange={e => setFormType(e.target.value as Banner['type'])}
                                    >
                                        <option value="info">🔵 Information (Bleu)</option>
                                        <option value="warning">🟡 Avertissement (Jaune)</option>
                                        <option value="danger">🔴 Urgent / Danger (Rouge)</option>
                                        <option value="success">🟢 Succès (Vert)</option>
                                    </select>
                                </div>
                            </div>

                            {/* SuperAdmin: Option bandeau global */}
                            {isSuperAdmin && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={formIsGlobal}
                                            onChange={e => setFormIsGlobal(e.target.checked)}
                                        />
                                        <span>Bandeau commun à toutes les Unités Locales (Global)</span>
                                    </label>
                                    {!formIsGlobal && uls.length > 0 && (
                                        <div style={{ marginTop: '4px' }}>
                                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                                Unité Locale ciblée
                                            </label>
                                            <select
                                                className="form-input"
                                                value={formUlId}
                                                onChange={e => setFormUlId(e.target.value)}
                                            >
                                                {uls.map(ul => (
                                                    <option key={ul.id} value={ul.id}>
                                                        {ul.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Statut actif */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={formIsActive}
                                    onChange={e => setFormIsActive(e.target.checked)}
                                />
                                <span>Activer ce bandeau immédiatement</span>
                            </label>

                            {/* Modal Actions */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setIsModalOpen(false)}
                                    disabled={submitting}
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={submitting}
                                >
                                    {submitting ? 'Enregistrement...' : (editingBanner ? 'Enregistrer' : 'Créer')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
