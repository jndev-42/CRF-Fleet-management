'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import RoleLegend from '@/components/users/RoleLegend';
import { isSuperAdmin } from '@/lib/roles';
import type { User, ULEntry } from '../types';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface UserULPermission {
    ulId: string;
    isHome: boolean;
    roles: string[];
}

interface ManageUserULsModalProps {
    user: User;
    availableULs: ULEntry[];
    availableRoles: string[];
    onClose: () => void;
    showToast: (msg: string, type?: 'success' | 'error') => void;
    onRefreshUsers?: () => void;
}

export default function ManageUserULsModal({
    user,
    availableULs,
    availableRoles,
    onClose,
    showToast,
    onRefreshUsers,
}: ManageUserULsModalProps) {
    useEscapeKey(onClose);
    const { data: session, update } = useSession();
    const [uls, setUls] = useState<UserULPermission[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const actorRoles = (session?.user?.roles || []) as string[];
    const isSuper = isSuperAdmin(actorRoles);
    const actorUlId = session?.user?.ulId || '';

    useEffect(() => {
        // Load user's existing UL rights
        fetch(`/api/users/${encodeURIComponent(user.email)}/ul`)
            .then(res => res.ok ? res.json() : { uls: [] })
            .then((data: { uls?: Array<{ id: string; isHome: boolean; roles: string[] }> }) => {
                const mapped = (data.uls || []).map((ul) => ({
                    ulId: ul.id,
                    isHome: !!ul.isHome,
                    roles: (ul.isHome && (!ul.roles || ul.roles.length === 0)) ? user.roles : (ul.roles || [])
                }));
                setUls(mapped);
            })
            .catch(() => showToast("Erreur lors de la récupération des droits", "error"))
            .finally(() => setLoading(false));
    }, [user, showToast]);

    function addRow() {
        setUls(prev => [...prev, { ulId: '', isHome: false, roles: [] }]);
    }

    function removeRow(index: number) {
        setUls(prev => prev.filter((_, i) => i !== index));
    }

    function updateRow<K extends keyof UserULPermission>(index: number, field: K, value: UserULPermission[K]) {
        setUls(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
    }

    function toggleRoleInRow(rowIndex: number, role: string) {
        const row = uls[rowIndex];
        const newRoles = row.roles.includes(role)
            ? row.roles.filter(r => r !== role)
            : [...row.roles, role];
        updateRow(rowIndex, 'roles', newRoles);
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        // Validation: no empty UL selections (except if they are deleted), no duplicate ULs
        const validUls = uls.filter(u => u.ulId);
        const uniqueUlIds = new Set(validUls.map(u => u.ulId));
        if (uniqueUlIds.size !== validUls.length) {
            showToast("Chaque Unité Locale ne peut être sélectionnée qu'une seule fois.", "error");
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(user.email)}/ul`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uls: validUls }),
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Erreur de sauvegarde");
            }
            showToast("Droits UL mis à jour avec succès");
            if (user.email === session?.user?.email) {
                await update();
            }
            if (onRefreshUsers) {
                onRefreshUsers();
            }
            onClose();
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : "Erreur de sauvegarde";
            showToast(errorMsg, "error");
        } finally {
            setSubmitting(false);
        }
    }

    // Filter available ULs for the dropdown (exclude ULs that are already selected, except for the current row)
    const getAvailableULsForDropdown = (currentRowUlId: string) => {
        const list = availableULs.filter(ul =>
            ul.id === currentRowUlId || !uls.some(row => row.ulId === ul.id)
        );
        if (!isSuper) {
            return list.filter(ul => ul.id === actorUlId);
        }
        return list;
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', width: '90%' }}>
                <div className="modal-header">
                    <h2 className="modal-title">🔑 Gérer les droits UL pour {user.name || user.email}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSave}>
                    <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                        {loading ? (
                            <div className="loading-container" style={{ padding: '32px 0' }}>
                                <div className="loading-spinner" />
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Droits Home */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-secondary)' }}>
                                            🏠 Unité Locale Principale (Appartenance)
                                        </div>
                                        <RoleLegend />
                                    </div>
                                    {uls.filter(u => u.isHome).map((row) => {
                                        const originalIdx = uls.indexOf(row);
                                        const ulName = availableULs.find(u => u.id === row.ulId)?.name || row.ulId || 'default';
                                        return (
                                            <div key={row.ulId} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>Unité Locale {ulName}</div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                    {availableRoles.map(role => {
                                                        const active = row.roles.includes(role);
                                                        const isRowDisabled = !isSuper && row.ulId !== actorUlId;
                                                        return (
                                                            <label key={role} style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                background: active ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                                                                border: `1px solid ${active ? '#3B82F6' : 'var(--border-primary)'}`,
                                                                borderRadius: '100px',
                                                                padding: '2px 8px',
                                                                fontSize: '12px',
                                                                cursor: isRowDisabled ? 'not-allowed' : 'pointer',
                                                                opacity: isRowDisabled ? 0.6 : 1,
                                                                color: active ? '#60A5FA' : 'var(--text-secondary)',
                                                                transition: 'all 0.2s',
                                                                userSelect: 'none'
                                                            }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={active}
                                                                    onChange={() => {
                                                                        if (isRowDisabled) return;
                                                                        toggleRoleInRow(originalIdx, role);
                                                                    }}
                                                                    disabled={isRowDisabled}
                                                                    style={{ display: 'none' }}
                                                                />
                                                                {role}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                                    ℹ️ Si aucun rôle n&apos;est sélectionné, l&apos;utilisateur utilisera ses rôles globaux sur cette UL.
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {uls.filter(u => u.isHome).length === 0 && (
                                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                                            Aucune UL principale (appartenance : default).
                                        </div>
                                    )}
                                </div>

                                {/* Droits Externes */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-secondary)' }}>
                                            🌐 Droits additionnels (Autres ULs)
                                        </div>
                                        {(isSuper || !uls.some(u => u.ulId === actorUlId)) && (
                                            <button type="button" className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={addRow}>
                                                ➕ Ajouter des droits externes
                                            </button>
                                        )}
                                    </div>

                                    {uls.filter(u => !u.isHome).length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '24px', background: 'rgba(255,255,255,0.01)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-primary)', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                                            Aucun droit externe configuré. L&apos;utilisateur n&apos;a accès qu&apos;à son UL principale.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {uls.map((row, idx) => {
                                                if (row.isHome) return null;
                                                const isRowDisabled = !isSuper && row.ulId && row.ulId !== actorUlId;
                                                return (
                                                    <div key={idx} style={{
                                                        display: 'flex',
                                                        alignItems: 'flex-start',
                                                        gap: '12px',
                                                        padding: '12px',
                                                        background: 'var(--bg-secondary)',
                                                        borderRadius: 'var(--radius-md)',
                                                        border: '1px solid var(--border-primary)',
                                                    }}>
                                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            {/* Dropdown Selection */}
                                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                                <select
                                                                    className="form-input"
                                                                    value={row.ulId}
                                                                    onChange={e => updateRow(idx, 'ulId', e.target.value)}
                                                                    disabled={!!isRowDisabled}
                                                                    required
                                                                    style={{ flex: 1, padding: '6px 10px', fontSize: '13px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                                                >
                                                                    <option value="" disabled>Choisir une Unité Locale...</option>
                                                                    {getAvailableULsForDropdown(row.ulId).map(ul => (
                                                                        <option key={ul.id} value={ul.id}>
                                                                            Unité Locale {ul.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                {!isRowDisabled && (
                                                                    <button type="button" className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.2)' }} onClick={() => removeRow(idx)}>
                                                                        Supprimer
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {/* Role Selection */}
                                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                                {availableRoles.map(role => {
                                                                    const active = row.roles.includes(role);
                                                                    return (
                                                                        <label key={role} style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                            background: active ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                                                                            border: `1px solid ${active ? '#3B82F6' : 'var(--border-primary)'}`,
                                                                            borderRadius: '100px',
                                                                            padding: '2px 8px',
                                                                            fontSize: '12px',
                                                                            cursor: isRowDisabled ? 'not-allowed' : 'pointer',
                                                                            opacity: isRowDisabled ? 0.6 : 1,
                                                                            color: active ? '#60A5FA' : 'var(--text-secondary)',
                                                                            transition: 'all 0.2s',
                                                                            userSelect: 'none'
                                                                        }}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={active}
                                                                                onChange={() => {
                                                                                    if (isRowDisabled) return;
                                                                                    toggleRoleInRow(idx, role);
                                                                                }}
                                                                                disabled={!!isRowDisabled}
                                                                                style={{ display: 'none' }}
                                                                            />
                                                                            {role}
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting || loading}>
                            {submitting ? 'Sauvegarde...' : '💾 Enregistrer les droits'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
