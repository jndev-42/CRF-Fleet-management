'use client';

import { useEffect, useState } from 'react';

interface UL {
    id: string;
    name: string;
    slug: string;
}

export default function ULsTab() {
    const [uls, setUls] = useState<UL[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const [newSlug, setNewSlug] = useState('');
    const [creating, setCreating] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }

    async function fetchULs() {
        try {
            const res = await fetch('/api/ul');
            if (res.ok) {
                const data = await res.json();
                setUls(data.uls ?? []);
            }
        } catch {
            // noop
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchULs();
    }, []);

    function handleNameChange(value: string) {
        setNewName(value);
        // Auto-generate slug from name
        const slug = value
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');
        setNewSlug(slug);
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newName.trim() || !newSlug.trim()) return;
        setCreating(true);
        try {
            const res = await fetch('/api/ul', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erreur');
            setUls(prev => [...prev, { id: data.id, name: newName.trim(), slug: newSlug.trim() }]);
            setNewName('');
            setNewSlug('');
            showToast(`UL "${newName}" créée avec succès`);
        } catch (err) {
            showToast((err as Error).message, 'error');
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete(ul: UL) {
        if (!confirm(`Supprimer l'UL "${ul.name}" ? Cette action est irréversible.`)) return;
        try {
            const res = await fetch(`/api/ul/${ul.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Erreur');
            }
            setUls(prev => prev.filter(u => u.id !== ul.id));
            showToast(`UL "${ul.name}" supprimée`);
        } catch (err) {
            showToast((err as Error).message, 'error');
        }
    }

    if (loading) return <div className="loading-container"><div className="loading-spinner" /></div>;

    return (
        <div>
            {toast && (
                <div className={`toast ${toast.type}`}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.message}
                </div>
            )}

            <div style={{ marginBottom: 24 }}>
                <h2 className="section-title" style={{ marginBottom: 8 }}>Unités Locales</h2>
                <p className="page-description">Gérez les Unités Locales disponibles dans l&apos;application.</p>
            </div>

            {/* Liste des UL */}
            <div style={{ marginBottom: 32 }}>
                {uls.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🏛️</div>
                        <div className="empty-state-title">Aucune UL configurée</div>
                        <p>Créez votre première Unité Locale ci-dessous.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {uls.map(ul => (
                            <div key={ul.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 16px',
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-primary)',
                            }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>Unité Locale {ul.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                        ID: <code style={{ fontFamily: 'monospace' }}>{ul.id}</code> · Slug: <code style={{ fontFamily: 'monospace' }}>{ul.slug}</code>
                                    </div>
                                </div>
                                <button
                                    className="btn btn-danger"
                                    style={{ fontSize: 13 }}
                                    onClick={() => handleDelete(ul)}
                                >
                                    Supprimer
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Formulaire de création */}
            <div style={{
                padding: '20px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-primary)',
            }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Ajouter une UL</h3>
                <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                Nom de l&apos;UL
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Paris 18"
                                value={newName}
                                onChange={e => handleNameChange(e.target.value)}
                                required
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                Slug (URL)
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="paris-18"
                                value={newSlug}
                                onChange={e => setNewSlug(e.target.value)}
                                pattern="[a-z0-9-]+"
                                required
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={creating || !newName.trim() || !newSlug.trim()}
                        >
                            {creating ? 'Création…' : '➕ Créer l\'UL'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
