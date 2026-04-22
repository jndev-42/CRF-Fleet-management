'use client';

import { useState } from 'react';
import { useModuleSettings } from '@/lib/contexts/ModuleSettingsContext';

const ROLE_DESCRIPTIONS = [
    {
        key: 'ADMIN', label: 'Administrateur', color: '#ef4444',
        bgColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)',
        description: 'Accès complet en lecture et écriture. Reçoit les notifications.',
        basePermissions: ['Gestion des utilisateurs', 'Gestion des véhicules', 'Réservations VL et VPSP', 'Notifications push'],
    },
    {
        key: 'RESPO', label: 'Responsable', color: '#f97316',
        bgColor: 'rgba(249, 115, 22, 0.08)', borderColor: 'rgba(249, 115, 22, 0.25)',
        description: 'Responsable d\'activité. Reçoit les notifications.',
        basePermissions: ['Validation des réservations', 'Retour de véhicule pour autrui', 'Modification des véhicules', 'Notifications push'],
    },
    {
        key: 'CI/RPAPS', label: 'CI / RPAPS', color: '#0ea5e9',
        bgColor: 'rgba(14, 165, 233, 0.08)', borderColor: 'rgba(14, 165, 233, 0.25)',
        description: 'Chargé d\'intervention / Responsable poste de secours.',
        basePermissions: ['Dépôt et consultation de ses comptes rendus'],
    },
    {
        key: 'CHVPSP', label: 'Chauffeur VPSP', color: '#8b5cf6',
        bgColor: 'rgba(139, 92, 246, 0.08)', borderColor: 'rgba(139, 92, 246, 0.25)',
        description: 'Chauffeur VPSP.',
        basePermissions: ['Réservations VPSP uniquement'],
    },
    {
        key: 'CHVL', label: 'Chauffeur VL', color: '#3b82f6',
        bgColor: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.25)',
        description: 'Chauffeur véhicule léger.',
        basePermissions: ['Réservations VL uniquement'],
    },
    {
        key: 'SECOURISTE', label: 'Secouriste', color: '#10b981',
        bgColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.25)',
        description: 'Accès inventaire. Assigné automatiquement à tout membre actif.',
        basePermissions: [],
    },
    {
        key: 'INACTIF', label: 'Inactif', color: '#6b7280',
        bgColor: 'rgba(107, 114, 128, 0.08)', borderColor: 'rgba(107, 114, 128, 0.25)',
        description: 'Compte inactif. L\'utilisateur n\'a accès à aucune fonctionnalité.',
        basePermissions: ['Aucun accès', '⚠️ Incompatible avec tous les autres rôles'],
    },
];

const MODULE_LABELS: Record<string, string> = {
    'stats': 'Statistiques & exports',
    'inventory': 'Gestion de l\'inventaire',
    'missions': 'Missions & comptes rendus',
};

export default function RoleLegend() {
    const [open, setOpen] = useState(false);
    const { settings } = useModuleSettings();

    function getDynamicPermissions(roleKey: string) {
        if (roleKey === 'INACTIF') return [];

        return settings
            .filter(s => s.allowed_roles.includes(roleKey))
            .map(s => MODULE_LABELS[s.module_key] || s.module_key);
    }

    return (
        <div style={{ marginBottom: 16 }}>
            <button
                onClick={() => setOpen(v => !v)}
                style={{
                    background: 'none', border: 'none', padding: '4px 0',
                    cursor: 'pointer', fontSize: 13,
                    color: 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', gap: 6,
                }}
            >
                <span style={{
                    transition: 'transform 0.2s', display: 'inline-block',
                    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                }}>▶</span>
                ℹ️ Légende des rôles
            </button>

            {open && (
                <div style={{
                    marginTop: 12, padding: 16,
                    background: 'rgba(59, 130, 246, 0.05)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 12,
                    }}>
                        {ROLE_DESCRIPTIONS.map(role => {
                            const dynamicPerms = getDynamicPermissions(role.key);
                            const allPerms = [...role.basePermissions, ...dynamicPerms];

                            return (
                                <div key={role.key} style={{
                                    background: role.bgColor,
                                    border: `1px solid ${role.borderColor}`,
                                    borderRadius: 'var(--radius-sm)',
                                    padding: '10px 12px',
                                }}>
                                    <span style={{
                                        display: 'inline-block',
                                        background: role.bgColor,
                                        border: `1px solid ${role.borderColor}`,
                                        borderRadius: '100px',
                                        padding: '2px 10px',
                                        fontSize: 12, fontWeight: 600,
                                        color: role.color,
                                        marginBottom: 6,
                                    }}>
                                        {role.label}
                                    </span>
                                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
                                        {role.description}
                                    </p>
                                    <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: '1.6' }}>
                                        {allPerms.map(p => <li key={p}>{p}</li>)}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
