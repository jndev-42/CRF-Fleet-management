'use client';

import { useState } from 'react';

const ROLE_DESCRIPTIONS = [
    {
        key: 'ADMIN', label: 'Administrateur', color: '#ef4444',
        bgColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)',
        description: 'Accès complet à toutes les fonctionnalités.',
        permissions: ['Gestion des utilisateurs', 'Statistiques & exports', 'Gestion des véhicules', 'Réservations VL et VPSP', 'Notifications push'],
    },
    {
        key: 'RESPO', label: 'Responsable', color: '#f97316',
        bgColor: 'rgba(249, 115, 22, 0.08)', borderColor: 'rgba(249, 115, 22, 0.25)',
        description: 'Responsable d\'activité.',
        permissions: ['Statistiques & exports', 'Notifications push', 'Pas de gestion des utilisateurs'],
    },
    {
        key: 'CHVPSP', label: 'Chauffeur VPSP', color: '#8b5cf6',
        bgColor: 'rgba(139, 92, 246, 0.08)', borderColor: 'rgba(139, 92, 246, 0.25)',
        description: 'Chauffeur véhicule léger et VPSP.',
        permissions: ['Statistiques & exports', 'Réservations VL et VPSP', 'Pas de gestion des utilisateurs'],
    },
    {
        key: 'CHVL', label: 'Chauffeur VL', color: '#3b82f6',
        bgColor: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.25)',
        description: 'Chauffeur véhicule léger.',
        permissions: ['Statistiques & exports', 'Réservations VL uniquement', 'Pas de notifications', 'Pas de gestion des utilisateurs'],
    },
    {
        key: 'SECOURISTE', label: 'Secouriste', color: '#10b981',
        bgColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.25)',
        description: 'Bénévole secouriste (non chauffeur).',
        permissions: ['Comptes rendus de mission (les siens)', 'Pas de véhicules', 'Pas de statistiques', 'Pas de gestion des utilisateurs'],
    },
    {
        key: 'GUEST', label: 'Invité', color: '#6b7280',
        bgColor: 'rgba(107, 114, 128, 0.08)', borderColor: 'rgba(107, 114, 128, 0.25)',
        description: 'Accès lecture seule. Exclusif : incompatible avec tout autre rôle.',
        permissions: ['Consultation uniquement', 'Aucune action possible', '⚠️ Incompatible avec tous les autres rôles'],
    },
];

export default function RoleLegend() {
    const [open, setOpen] = useState(false);

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
