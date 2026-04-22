'use client';

import { useState, useEffect } from 'react';
import { useModuleSettings } from '@/lib/contexts/ModuleSettingsContext';

interface ModuleConfig {
    key: string;
    label: string;
    description: string;
}

const MODULE_CONFIGS: ModuleConfig[] = [
    {
        key: 'stats',
        label: 'Statistiques',
        description: 'Accès à la page de statistiques et à l\'export PDF/CSV.',
    },
    {
        key: 'inventory',
        label: 'Inventaire',
        description: 'Accès à la page d\'inventaire et à l\'onglet Inventaire sur la fiche véhicule.',
    },
    {
        key: 'missions',
        label: 'Missions',
        description: 'Accès à la page des comptes rendus de mission.',
    },
];

export default function ModulesTab() {
    const { settings, refresh } = useModuleSettings();
    const [updating, setUpdating] = useState<string | null>(null);
    const [localSettings, setLocalSettings] = useState<Record<string, string[]>>({});
    const [availableRoles, setAvailableRoles] = useState<string[]>([]);

    useEffect(() => {
        fetch('/api/users')
            .then(res => res.json())
            .then(data => {
                if (data.availableRoles) {
                    setAvailableRoles(data.availableRoles.filter((r: string) => r !== 'INACTIF'));
                }
            })
            .catch(console.error);
    }, []);

    function getAllowedRolesForKey(key: string): string[] {
        if (key in localSettings) return localSettings[key];
        const found = settings.find(s => s.module_key === key);
        return found?.allowed_roles ?? [];
    }

    async function handleRoleToggle(key: string, role: string) {
        const currentRoles = getAllowedRolesForKey(key);
        const newRoles = currentRoles.includes(role)
            ? currentRoles.filter(r => r !== role)
            : [...currentRoles, role];

        // Optimistic update
        setLocalSettings(prev => ({ ...prev, [key]: newRoles }));
        setUpdating(key);

        try {
            const res = await fetch(`/api/settings/modules/${encodeURIComponent(key)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allowed_roles: newRoles }),
            });

            if (!res.ok) {
                // Revert on failure
                setLocalSettings(prev => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });
            } else {
                refresh();
                // Clear local override now that context is refreshed
                setLocalSettings(prev => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });
            }
        } catch {
            // Revert on error
            setLocalSettings(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        } finally {
            setUpdating(null);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 8px 0' }}>
                Contrôlez quels rôles ont accès à chaque module. Les modifications s&apos;appliquent immédiatement pour tous les utilisateurs.
            </p>

            {MODULE_CONFIGS.map(module => {
                const allowedRoles = getAllowedRolesForKey(module.key);
                const isUpdating = updating === module.key;

                return (
                    <div
                        key={module.key}
                        style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '20px 24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            opacity: isUpdating ? 0.7 : 1,
                            transition: 'opacity 0.2s',
                        }}
                    >
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>{module.label}</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{module.description}</div>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {availableRoles.map(role => {
                                const isSelected = allowedRoles.includes(role);
                                return (
                                    <button
                                        key={role}
                                        disabled={isUpdating}
                                        onClick={() => handleRoleToggle(module.key, role)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '20px',
                                            border: isSelected ? '1px solid var(--primary-color)' : '1px solid var(--border-primary)',
                                            fontSize: '12px',
                                            fontWeight: isSelected ? 600 : 400,
                                            background: isSelected ? 'var(--primary-light)' : 'transparent',
                                            color: isSelected ? 'var(--primary-color)' : 'var(--text-secondary)',
                                            cursor: isUpdating ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {isSelected ? '✓ ' : '+ '}{role}
                                    </button>
                                );
                            })}
                        </div>
                        {allowedRoles.length === 0 && (
                            <div style={{ fontSize: '12px', color: '#EF4444', fontStyle: 'italic' }}>
                                ⚠️ Aucun rôle n&apos;a accès à ce module (désactivé).
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
