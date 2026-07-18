'use client';

import { useState } from 'react';

const ROLE_DESCRIPTIONS = [
    {
        key: 'SUPER_ADMIN', label: 'Super Administrateur', color: '#dc2626',
        bgColor: 'rgba(220, 38, 38, 0.08)', borderColor: 'rgba(220, 38, 38, 0.35)',
        description: 'Accès complet à toutes les ULs. Seul rôle pouvant activer/désactiver les modules.',
        permissions: ['Gestion complète de toutes les ULs', 'Attribuer le rôle Super Admin', 'Activer/désactiver les modules (Menus)', 'Statistiques & exports', 'Gestion des véhicules & inventaire', 'Réservations VL et VPSP', 'Notifications push'],
    },
    {
        key: 'ADMIN', label: 'Administrateur', color: '#ef4444',
        bgColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)',
        description: 'Accès complet en lecture et écriture dans son UL uniquement. Reçoit les notifications.',
        permissions: ['Gestion des utilisateurs (son UL)', 'Statistiques & exports', 'Gestion des véhicules', 'Réservations VL et VPSP', 'Missions & inventaire', 'Notifications push'],
    },
    {
        key: 'PRESIDENT', label: 'Président', color: '#f97316',
        bgColor: 'rgba(249, 115, 22, 0.08)', borderColor: 'rgba(249, 115, 22, 0.25)',
        description: 'Accès en lecture seule à tout dans son UL.',
        permissions: ['Consulter les utilisateurs (lecture)', 'Statistiques & exports', 'Consulter les véhicules & missions', 'Consulter l\'inventaire'],
    },
    {
        key: 'CADRE', label: 'Cadre', color: '#eab308',
        bgColor: 'rgba(234, 179, 8, 0.08)', borderColor: 'rgba(234, 179, 8, 0.25)',
        description: 'Accès en lecture seule à tout dans son UL.',
        permissions: ['Consulter les utilisateurs (lecture)', 'Statistiques & exports', 'Consulter les véhicules & missions', 'Consulter l\'inventaire'],
    },
    {
        key: 'CI/RPAPS', label: 'CI / RPAPS', color: '#0ea5e9',
        bgColor: 'rgba(14, 165, 233, 0.08)', borderColor: 'rgba(14, 165, 233, 0.25)',
        description: 'Chargé d\'intervention / Responsable poste de secours.',
        permissions: ['Dépôt et consultation de ses comptes rendus', 'Statistiques & exports'],
    },
    {
        key: 'CHVPSP', label: 'Chauffeur VPSP', color: '#8b5cf6',
        bgColor: 'rgba(139, 92, 246, 0.08)', borderColor: 'rgba(139, 92, 246, 0.25)',
        description: 'Chauffeur VPSP.',
        permissions: ['Réservations VPSP uniquement', 'Statistiques & exports'],
    },
    {
        key: 'CHVL', label: 'Chauffeur VL', color: '#3b82f6',
        bgColor: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.25)',
        description: 'Chauffeur véhicule léger.',
        permissions: ['Réservations VL uniquement', 'Statistiques & exports'],
    },
    {
        key: 'INACTIF', label: 'Inactif', color: '#6b7280',
        bgColor: 'rgba(107, 114, 128, 0.08)', borderColor: 'rgba(107, 114, 128, 0.25)',
        description: 'Compte inactif. L\'utilisateur n\'a accès à aucune fonctionnalité.',
        permissions: ['Aucun accès', '⚠️ Incompatible avec tous les autres rôles'],
    },
];

export default function RoleLegend() {
    const [open, setOpen] = useState(false);

    return (
        <div style={{ marginBottom: 16 }}>
            <button
                type="button"
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
                        {ROLE_DESCRIPTIONS.map(role => (
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
                                    {role.permissions.map(p => <li key={p}>{p}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
