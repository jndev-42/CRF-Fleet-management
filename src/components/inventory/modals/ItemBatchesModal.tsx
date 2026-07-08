'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface Batch {
    id: string;
    quantity: number;
    expiryDate: string | null;
}

interface ItemBatchesModalProps {
    itemId: string;
    itemName: string;
    onClose: () => void;
    onBatchDeleted?: () => void; // callback optionnel pour rafraîchir la page parente
}

export default function ItemBatchesModal({ itemId, itemName, onClose, onBatchDeleted }: ItemBatchesModalProps) {
    const { data: session } = useSession();
    const isAdmin = ((session?.user?.roles ?? []) as string[]).includes('ADMIN');

    const [batches, setBatches] = useState<Batch[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState<Record<string, boolean>>({});

    const [newExpiryDate, setNewExpiryDate] = useState('');
    const [newQuantity, setNewQuantity] = useState('');
    const [deductFromNoDate, setDeductFromNoDate] = useState(true);
    const [adjustingBatch, setAdjustingBatch] = useState<Record<string, boolean>>({});

    const fetchBatches = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/inventory/batches?itemId=${itemId}`);
            if (res.ok) {
                const data = await res.json();
                setBatches(data.batches);
            }
        } catch (e) {
            console.error('Erreur fetch batches:', e);
        } finally {
            setLoading(false);
        }
    }, [itemId]);

    const handleAdjustBatchQuantity = async (batchId: string, change: number) => {
        setAdjustingBatch(prev => ({ ...prev, [batchId]: true }));
        try {
            const res = await fetch('/api/inventory/batches', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchId, change }),
            });
            if (res.ok) {
                const data = await res.json();
                setBatches(prev => prev.map(b => 
                    b.id === batchId ? { ...b, quantity: data.newBatchQuantity } : b
                ).filter(b => b.quantity > 0));
                onBatchDeleted?.();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de l\'ajustement');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setAdjustingBatch(prev => ({ ...prev, [batchId]: false }));
        }
    };

    useEffect(() => {
        fetchBatches();
    }, [fetchBatches]);

    const handleAddBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        const qty = parseInt(newQuantity);
        if (!newExpiryDate || isNaN(qty) || qty <= 0) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/inventory/adjust', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId,
                    change: qty,
                    expiryDate: newExpiryDate,
                    deductFromNoDate,
                    note: deductFromNoDate ? `Découpage stock vers ${newExpiryDate}` : `Ajout lot ${newExpiryDate}`
                }),
            });

            if (res.ok) {
                setNewExpiryDate('');
                setNewQuantity('');
                fetchBatches();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de l\'ajout du lot');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteBatch = async (batch: Batch) => {
        const dateLabel = formatDate(batch.expiryDate);
        if (!confirm(`Supprimer le lot « ${dateLabel} » (${batch.quantity} unité(s)) ? Cette action est irréversible.`)) return;

        setDeleting(prev => ({ ...prev, [batch.id]: true }));
        try {
            const res = await fetch(`/api/inventory/batches?batchId=${batch.id}`, { method: 'DELETE' });
            if (res.ok) {
                setBatches(prev => prev.filter(b => b.id !== batch.id));
                onBatchDeleted?.();
            } else {
                const data = await res.json() as { error?: string };
                alert(data.error || 'Erreur lors de la suppression');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setDeleting(prev => ({ ...prev, [batch.id]: false }));
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Sans date';
        const d = new Date(dateStr);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    };

    const isExpired = (dateStr: string | null) => {
        if (!dateStr) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return new Date(dateStr) < today;
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={_e => _e.stopPropagation()} style={{ maxWidth: '520px' }}>
                <div className="modal-header">
                    <h2 className="modal-title">Détails des lots — {itemName}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <p>Chargement...</p>
                    ) : (
                        <>
                            <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '4px', fontSize: '0.9rem' }}>
                                <strong>{batches.find(b => b.expiryDate === null)?.quantity || 0}</strong> items sans date de péremption
                            </div>

                            {batches.length > 0 && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-primary)' }}>
                                            <th style={{ padding: '8px' }}>Date de péremption</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>Quantité</th>
                                            {isAdmin && <th style={{ padding: '8px', textAlign: 'center', width: '90px' }}>Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {batches.map(batch => {
                                            const expired = isExpired(batch.expiryDate);
                                            return (
                                                <tr key={batch.id} style={{
                                                    borderBottom: '1px solid var(--border-primary)',
                                                    background: expired ? 'rgba(220,38,38,0.05)' : undefined,
                                                }}>
                                                    <td style={{ padding: '8px' }}>
                                                        <span style={{
                                                            fontWeight: expired ? 600 : 400,
                                                            color: expired ? '#dc2626' : undefined,
                                                        }}>
                                                            {formatDate(batch.expiryDate)}
                                                            {expired && ' ⚠️ Périmé'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                            {isAdmin && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleAdjustBatchQuantity(batch.id, -10)}
                                                                        disabled={adjustingBatch[batch.id] || batch.quantity < 10}
                                                                        style={{
                                                                            minWidth: '32px',
                                                                            height: '24px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            border: '1px solid var(--border-primary)',
                                                                            background: 'var(--bg-muted)',
                                                                            borderRadius: '4px',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: 'bold',
                                                                            opacity: (adjustingBatch[batch.id] || batch.quantity < 10) ? 0.5 : 1,
                                                                        }}
                                                                        title="-10"
                                                                    >
                                                                        -10
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleAdjustBatchQuantity(batch.id, -1)}
                                                                        disabled={adjustingBatch[batch.id] || batch.quantity <= 0}
                                                                        style={{
                                                                            width: '24px',
                                                                            height: '24px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            border: '1px solid var(--border-primary)',
                                                                            background: 'var(--bg-muted)',
                                                                            borderRadius: '4px',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.8rem',
                                                                            fontWeight: 'bold',
                                                                            opacity: (adjustingBatch[batch.id] || batch.quantity <= 0) ? 0.5 : 1,
                                                                        }}
                                                                        title="-1"
                                                                    >
                                                                        -
                                                                    </button>
                                                                </>
                                                            )}
                                                            <span style={{ minWidth: '32px', textAlign: 'center', display: 'inline-block' }}>{batch.quantity}</span>
                                                            {isAdmin && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleAdjustBatchQuantity(batch.id, 1)}
                                                                        disabled={adjustingBatch[batch.id]}
                                                                        style={{
                                                                            width: '24px',
                                                                            height: '24px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            border: '1px solid var(--border-primary)',
                                                                            background: 'var(--bg-muted)',
                                                                            borderRadius: '4px',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.8rem',
                                                                            fontWeight: 'bold',
                                                                            opacity: adjustingBatch[batch.id] ? 0.5 : 1,
                                                                        }}
                                                                        title="+1"
                                                                    >
                                                                        +
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleAdjustBatchQuantity(batch.id, 10)}
                                                                        disabled={adjustingBatch[batch.id]}
                                                                        style={{
                                                                            minWidth: '32px',
                                                                            height: '24px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            border: '1px solid var(--border-primary)',
                                                                            background: 'var(--bg-muted)',
                                                                            borderRadius: '4px',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: 'bold',
                                                                            opacity: adjustingBatch[batch.id] ? 0.5 : 1,
                                                                        }}
                                                                        title="+10"
                                                                    >
                                                                        +10
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {isAdmin && (
                                                        <td style={{ padding: '8px', textAlign: 'center' }}>
                                                            {expired && (
                                                                <button
                                                                    onClick={() => handleDeleteBatch(batch)}
                                                                    disabled={deleting[batch.id]}
                                                                    style={{
                                                                        background: 'none',
                                                                        border: '1px solid #dc2626',
                                                                        color: '#dc2626',
                                                                        borderRadius: '6px',
                                                                        padding: '3px 10px',
                                                                        fontSize: '0.8rem',
                                                                        cursor: 'pointer',
                                                                        fontWeight: 600,
                                                                        opacity: deleting[batch.id] ? 0.5 : 1,
                                                                    }}
                                                                >
                                                                    {deleting[batch.id] ? '...' : '🗑 Supprimer'}
                                                                </button>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}

                            <div style={{ border: '1px solid var(--border-primary)', padding: '1rem', borderRadius: '8px' }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Ajouter une date de péremption</h3>
                                <form onSubmit={handleAddBatch}>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <div style={{ flex: 2 }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Date</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={newExpiryDate}
                                                onChange={e => setNewExpiryDate(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Qté</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                min="1"
                                                value={newQuantity}
                                                onChange={e => setNewQuantity(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={deductFromNoDate}
                                                onChange={e => setDeductFromNoDate(e.target.checked)}
                                            />
                                            Déduire du stock sans date
                                        </label>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        style={{ width: '100%' }}
                                        disabled={submitting}
                                    >
                                        {submitting ? 'Enregistrement...' : 'Enregistrer'}
                                    </button>
                                </form>
                            </div>
                        </>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                </div>
            </div>
        </div>
    );
}
