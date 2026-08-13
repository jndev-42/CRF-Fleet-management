'use client';

import { useState } from 'react';
import { useMenuSettings, MenuVisibility } from '@/lib/contexts/MenuSettingsContext';

interface MenuConfig {
    key: string;
    label: string;
    description: string;
}

const MENU_CONFIGS: MenuConfig[] = [
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

const VISIBILITY_OPTIONS: { value: MenuVisibility; label: string }[] = [
    { value: 'available', label: 'Activé' },
    { value: 'admin_only', label: 'Admin uniquement' },
    { value: 'disabled', label: 'Désactivé' },
];

export default function MenusTab() {
    const { settings, refresh } = useMenuSettings();
    const [updating, setUpdating] = useState<string | null>(null);
    const [localSettings, setLocalSettings] = useState<Record<string, MenuVisibility>>({});

    function getVisibilityForKey(key: string): MenuVisibility {
        if (key in localSettings) return localSettings[key];
        const found = settings.find(s => s.menu_key === key);
        return found?.visibility ?? 'available';
    }

    async function handleVisibilityChange(key: string, value: MenuVisibility) {
        // Optimistic update
        setLocalSettings(prev => ({ ...prev, [key]: value }));
        setUpdating(key);

        try {
            const res = await fetch(`/api/settings/menus/${encodeURIComponent(key)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visibility: value }),
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
                Contrôlez la visibilité de chaque section de la navigation. Les modifications s&apos;appliquent immédiatement pour tous les utilisateurs.
            </p>

            {MENU_CONFIGS.map(menu => {
                const currentValue = getVisibilityForKey(menu.key);
                const isUpdating = updating === menu.key;

                return (
                    <div
                        key={menu.key}
                        style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '20px 24px',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '16px',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            opacity: isUpdating ? 0.7 : 1,
                            transition: 'opacity 0.2s',
                        }}
                    >
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>{menu.label}</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{menu.description}</div>
                        </div>

                        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '4px' }}>
                            {VISIBILITY_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    disabled={isUpdating}
                                    onClick={() => handleVisibilityChange(menu.key, opt.value)}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: 'var(--radius-sm)',
                                        border: 'none',
                                        fontSize: '13px',
                                        fontWeight: currentValue === opt.value ? 600 : 400,
                                        background: currentValue === opt.value ? 'var(--bg-primary)' : 'transparent',
                                        color: currentValue === opt.value
                                            ? (opt.value === 'disabled' ? 'var(--status-maintenance)' : opt.value === 'admin_only' ? 'var(--status-inuse)' : 'var(--status-available)')
                                            : 'var(--text-secondary)',
                                        cursor: isUpdating ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.15s',
                                        boxShadow: currentValue === opt.value ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
