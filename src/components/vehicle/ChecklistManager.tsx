import React, { useState, useEffect, useCallback } from 'react';

export interface ChecklistItemType {
    id: string;
    vehicleId: string;
    label: string;
    type: 'checkout' | 'checkin';
    required: boolean;
    order: number;
    createdAt: string;
}

interface ChecklistManagerProps {
    vehicleId: string;
    vehicleName: string;
    onClose: () => void;
}

/**
 * Admin modal to manage custom checklists (check-out and check-in) for a vehicle.
 */
export default function ChecklistManager({ vehicleId, vehicleName, onClose }: ChecklistManagerProps) {
    const [items, setItems] = useState<ChecklistItemType[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'checkout' | 'checkin'>('checkout');

    // New item form
    const [newItemLabel, setNewItemLabel] = useState('');
    const [newItemRequired, setNewItemRequired] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const fetchItems = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/vehicles/${vehicleId}/checklist`);
            if (!res.ok) throw new Error();
            const data: ChecklistItemType[] = await res.json();
            setItems(data);
        } catch (error) {
            console.error('Failed to fetch checklist items', error);
        } finally {
            setLoading(false);
        }
    }, [vehicleId]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const activeItems = items.filter(i => i.type === activeTab).sort((a, b) => a.order - b.order);

    async function handleAddItem(e: React.FormEvent) {
        e.preventDefault();
        if (!newItemLabel.trim()) return;

        setSubmitting(true);
        try {
            const res = await fetch(`/api/vehicles/${vehicleId}/checklist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label: newItemLabel.trim(),
                    type: activeTab,
                    required: newItemRequired
                })
            });
            if (!res.ok) throw new Error();

            setNewItemLabel('');
            setNewItemRequired(false);
            await fetchItems();
        } catch (error) {
            alert("Erreur lors de l'ajout de l'item");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDeleteItem(id: string) {
        if (!confirm('Supprimer cet item ?')) return;
        try {
            const res = await fetch(`/api/checklist/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            setItems(prev => prev.filter(i => i.id !== id));
        } catch (error) {
            alert('Erreur lors de la suppression');
        }
    }

    async function handleToggleRequired(item: ChecklistItemType) {
        // Optimistic toggle
        const newVal = !item.required;
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, required: newVal } : i));
        try {
            const res = await fetch(`/api/checklist/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ required: newVal })
            });
            if (!res.ok) throw new Error();
        } catch (error) {
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, required: !newVal } : i));
            alert('Erreur lors de la modification');
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h2 className="modal-title">⚙️ Checklist • {vehicleName}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body" style={{ padding: '0 20px 20px' }}>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid var(--border-primary)' }}>
                        {(['checkout', 'checkin'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '10px 16px',
                                    background: 'none',
                                    border: 'none',
                                    borderBottom: activeTab === tab ? '2px solid var(--crf-red)' : '2px solid transparent',
                                    color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    fontWeight: activeTab === tab ? 600 : 400,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {tab === 'checkout' ? 'Prise (Départ)' : 'Rendu (Retour)'}
                            </button>
                        ))}
                    </div>

                    {/* Active Tab Content */}
                    {loading ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Chargement...</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {activeItems.length === 0 ? (
                                <div style={{
                                    padding: '24px', textAlign: 'center', background: 'var(--bg-secondary)',
                                    borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 13
                                }}>
                                    Aucun item dans cette checklist.
                                </div>
                            ) : (
                                activeItems.map(item => (
                                    <div key={item.id} style={{
                                        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
                                        padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                                        borderRadius: 'var(--radius-sm)'
                                    }}>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <span style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</span>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', width: 'fit-content' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={item.required}
                                                    onChange={() => handleToggleRequired(item)}
                                                />
                                                Obligatoire
                                            </label>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteItem(item.id)}
                                            style={{
                                                background: 'none', border: 'none', color: '#EF4444',
                                                cursor: 'pointer', padding: 4, opacity: 0.7
                                            }}
                                            onMouseOver={e => e.currentTarget.style.opacity = '1'}
                                            onMouseOut={e => e.currentTarget.style.opacity = '0.7'}
                                            title="Supprimer l'item"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))
                            )}

                            {/* Add Item Form */}
                            <form onSubmit={handleAddItem} style={{
                                marginTop: 12, paddingTop: 16, borderTop: '1px dashed var(--border-primary)',
                                display: 'flex', flexDirection: 'column', gap: 12
                            }}>
                                <span style={{ fontSize: 13, fontWeight: 600 }}>Ajouter un item</span>
                                <input
                                    className="form-input"
                                    placeholder="Libellé de la vérification..."
                                    value={newItemLabel}
                                    onChange={e => setNewItemLabel(e.target.value)}
                                    required
                                />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={newItemRequired}
                                            onChange={e => setNewItemRequired(e.target.checked)}
                                        />
                                        Bloquant (obligatoire)
                                    </label>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={submitting || !newItemLabel.trim()}
                                        style={{ padding: '6px 14px', fontSize: 13 }}
                                    >
                                        {submitting ? '...' : 'Ajouter'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
