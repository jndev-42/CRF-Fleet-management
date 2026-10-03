'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ThemeStatus } from '@/lib/themes/catalog';
import styles from './ThemesTab.module.css';

export interface ThemeConfig {
    key: string;
    label: string;
    description: string;
    enabled: boolean;
    startDate: string | null;
    endDate: string | null;
    status: ThemeStatus;
}

interface Draft {
    enabled: boolean;
    startDate: string;
    endDate: string;
}

const STATUS_LABELS: Record<ThemeStatus, string> = {
    active: "Actif aujourd'hui",
    scheduled: 'Programmé',
    inactive: 'Inactif',
};

function toDraft(theme: ThemeConfig): Draft {
    return { enabled: theme.enabled, startDate: theme.startDate ?? '', endDate: theme.endDate ?? '' };
}

export default function ThemesTab() {
    const [themes, setThemes] = useState<ThemeConfig[]>([]);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [saving, setSaving] = useState<string | null>(null);
    const [messages, setMessages] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/settings/themes');
            const data = await res.json();
            if (!res.ok) {
                setLoadError(data.error ?? 'Erreur lors du chargement des thèmes');
                return;
            }
            const list: ThemeConfig[] = data.themes ?? [];
            setThemes(list);
            setDrafts(Object.fromEntries(list.map(t => [t.key, toDraft(t)])));
            setLoadError('');
        } catch {
            setLoadError('Erreur lors du chargement des thèmes');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    function updateDraft(key: string, patch: Partial<Draft>) {
        setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    }

    async function save(key: string) {
        const draft = drafts[key];
        setSaving(key);
        setMessages(prev => { const next = { ...prev }; delete next[key]; return next; });
        try {
            const res = await fetch(`/api/settings/themes/${encodeURIComponent(key)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: draft.enabled,
                    startDate: draft.startDate || null,
                    endDate: draft.endDate || null,
                }),
            });
            if (res.ok) {
                setMessages(prev => ({ ...prev, [key]: { type: 'success', text: 'Thème enregistré' } }));
                await load();
            } else {
                const data = await res.json().catch(() => ({}));
                setMessages(prev => ({ ...prev, [key]: { type: 'error', text: data.error ?? "Échec de l'enregistrement" } }));
            }
        } catch {
            setMessages(prev => ({ ...prev, [key]: { type: 'error', text: "Échec de l'enregistrement" } }));
        } finally {
            setSaving(null);
        }
    }

    if (loading) return <p className={styles.help}>Chargement…</p>;
    if (loadError) return <div className={styles.error} role="alert">{loadError}</div>;

    return (
        <div className={styles.container}>
            <p className={styles.help}>
                Activez un thème décoratif sur une plage de dates (bornes incluses, heure de Paris). Il s&apos;affiche pour tous les utilisateurs connectés, qui peuvent le masquer depuis la barre de navigation.
            </p>

            {themes.map(theme => {
                const draft = drafts[theme.key] ?? toDraft(theme);
                const message = messages[theme.key];
                return (
                    <div key={theme.key} className={styles.card}>
                        <div className={styles.header}>
                            <div>
                                <h3 className={styles.title}>{theme.label}</h3>
                                <p className={styles.description}>{theme.description}</p>
                            </div>
                            <span className={`${styles.badge} ${styles[theme.status]}`}>{STATUS_LABELS[theme.status]}</span>
                        </div>

                        <label className={styles.switch}>
                            <input
                                type="checkbox"
                                checked={draft.enabled}
                                onChange={e => updateDraft(theme.key, { enabled: e.target.checked })}
                            />
                            <span>Thème activé</span>
                        </label>

                        <div className={styles.dates}>
                            <div className="form-group">
                                <label className="form-label" htmlFor={`${theme.key}-start`}>Début</label>
                                <input
                                    id={`${theme.key}-start`}
                                    type="date"
                                    className="form-input"
                                    value={draft.startDate}
                                    onChange={e => updateDraft(theme.key, { startDate: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor={`${theme.key}-end`}>Fin</label>
                                <input
                                    id={`${theme.key}-end`}
                                    type="date"
                                    className="form-input"
                                    value={draft.endDate}
                                    min={draft.startDate || undefined}
                                    onChange={e => updateDraft(theme.key, { endDate: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className={styles.actions}>
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={saving === theme.key}
                                onClick={() => save(theme.key)}
                            >
                                {saving === theme.key ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                            {message && (
                                <span
                                    role={message.type === 'error' ? 'alert' : 'status'}
                                    className={message.type === 'error' ? styles.messageError : styles.messageSuccess}
                                >
                                    {message.text}
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
