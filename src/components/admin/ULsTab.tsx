'use client';

import { useEffect, useState } from 'react';

interface PhoneNum {
    label: string;
    number: string;
}

interface UL {
    id: string;
    name: string;
    slug: string;
    phoneNumbers?: PhoneNum[];
}

export default function ULsTab() {
    const [uls, setUls] = useState<UL[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUl, setEditingUl] = useState<UL | null>(null);
    const [formName, setFormName] = useState('');
    const [formSlug, setFormSlug] = useState('');
    const [phoneNumbers, setPhoneNumbers] = useState<PhoneNum[]>([]);
    const [submitting, setSubmitting] = useState(false);

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

    function handleOpenModal(ul: UL | null = null) {
        if (ul) {
            setEditingUl(ul);
            setFormName(ul.name);
            setFormSlug(ul.slug);
            setPhoneNumbers(ul.phoneNumbers || []);
        } else {
            setEditingUl(null);
            setFormName('');
            setFormSlug('');
            setPhoneNumbers([]);
        }
        setIsModalOpen(true);
    }

    function handleNameChange(value: string) {
        setFormName(value);
        if (!editingUl) {
            // Auto-generate slug from name during creation only
            const slug = value
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
                .replace(/[^a-z0-9\s-]/g, '')
                .trim()
                .replace(/\s+/g, '-');
            setFormSlug(slug);
        }
    }

    function addPhoneRow() {
        setPhoneNumbers(prev => [...prev, { label: '', number: '' }]);
    }

    function removePhoneRow(index: number) {
        setPhoneNumbers(prev => prev.filter((_, i) => i !== index));
    }

    function updatePhoneRow(index: number, field: 'label' | 'number', value: string) {
        setPhoneNumbers(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!formName.trim() || !formSlug.trim()) return;

        // Filter out empty phone rows
        const validPhoneNumbers = phoneNumbers.filter(p => p.label.trim() && p.number.trim());

        setSubmitting(true);
        try {
            if (editingUl) {
                // Edit mode
                const res = await fetch(`/api/ul/${editingUl.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formName.trim(),
                        slug: formSlug.trim(),
                        phoneNumbers: validPhoneNumbers
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Erreur lors de la modification');
                
                showToast(`UL "${formName}" modifiée avec succès`);
            } else {
                // Create mode
                const res = await fetch('/api/ul', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formName.trim(),
                        slug: formSlug.trim(),
                        phoneNumbers: validPhoneNumbers
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Erreur lors de la création');

                showToast(`UL "${formName}" créée avec succès`);
            }
            setIsModalOpen(false);
            fetchULs();
        } catch (err) {
            showToast((err as Error).message, 'error');
        } finally {
            setSubmitting(false);
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 className="section-title" style={{ marginBottom: 8 }}>Unités Locales</h2>
                    <p className="page-description">Gérez les Unités Locales disponibles dans l&apos;application.</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => handleOpenModal(null)}
                >
                    ➕ Ajouter une UL
                </button>
            </div>

            {/* Liste des UL */}
            <div style={{ marginBottom: 32 }}>
                {uls.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🏛️</div>
                        <div className="empty-state-title">Aucune UL configurée</div>
                        <p>Configurez votre première Unité Locale en cliquant sur le bouton ci-dessus.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {uls.map(ul => (
                            <div key={ul.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '16px',
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-primary)',
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>Unité Locale {ul.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                        ID: <code style={{ fontFamily: 'monospace' }}>{ul.id}</code> · Slug: <code style={{ fontFamily: 'monospace' }}>{ul.slug}</code>
                                    </div>
                                    {ul.phoneNumbers && ul.phoneNumbers.length > 0 && (
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                            {ul.phoneNumbers.map((phone, idx) => (
                                                <span key={idx} style={{
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1px solid var(--border-primary)',
                                                    borderRadius: '4px',
                                                    padding: '2px 8px',
                                                    fontSize: '11px',
                                                    color: 'var(--text-secondary)'
                                                }}>
                                                    <strong>{phone.label}:</strong> {phone.number}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ fontSize: 13 }}
                                        onClick={() => handleOpenModal(ul)}
                                    >
                                        Modifier
                                    </button>
                                    <button
                                        className="btn btn-danger"
                                        style={{ fontSize: 13 }}
                                        onClick={() => handleDelete(ul)}
                                    >
                                        Supprimer
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal de création / édition */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px', width: '90%' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                {editingUl ? `📝 Modifier l'UL ${editingUl.name}` : '🏛️ Ajouter une Unité Locale'}
                            </h2>
                            <button className="modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                            Nom de l&apos;UL
                                        </label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Paris 18"
                                            value={formName}
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
                                            value={formSlug}
                                            onChange={e => setFormSlug(e.target.value)}
                                            pattern="[a-z0-9-]+"
                                            required
                                            disabled={!!editingUl} // Lock slug on edit for safety
                                        />
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            📞 Numéros de téléphone
                                        </label>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{ fontSize: 12, padding: '4px 8px' }}
                                            onClick={addPhoneRow}
                                        >
                                            ➕ Ajouter un numéro
                                        </button>
                                    </div>

                                    {phoneNumbers.length === 0 ? (
                                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px 0', border: '1px dashed var(--border-primary)', borderRadius: 'var(--radius-md)' }}>
                                            Aucun numéro ajouté. Cliquez sur le bouton ci-dessus pour en ajouter.
                                        </p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {phoneNumbers.map((phone, idx) => (
                                                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        style={{ flex: 1, fontSize: 13 }}
                                                        placeholder="Libellé (ex: DLUS)"
                                                        value={phone.label}
                                                        onChange={e => updatePhoneRow(idx, 'label', e.target.value)}
                                                        required
                                                    />
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        style={{ flex: 1, fontSize: 13 }}
                                                        placeholder="Numéro (ex: 06 00 00 00 00)"
                                                        value={phone.number}
                                                        onChange={e => updatePhoneRow(idx, 'number', e.target.value)}
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn btn-danger"
                                                        style={{ padding: '8px 12px', fontSize: 13 }}
                                                        onClick={() => removePhoneRow(idx)}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border-primary)', padding: '16px 20px' }}>
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
                                    disabled={submitting || !formName.trim() || !formSlug.trim()}
                                >
                                    {submitting ? 'Enregistrement…' : 'Enregistrer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
