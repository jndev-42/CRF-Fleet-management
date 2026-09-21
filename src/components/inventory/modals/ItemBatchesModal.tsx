'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { isAdminOrAbove } from '@/lib/roles';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import styles from './ItemBatchesModal.module.css';

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
    useEscapeKey(onClose);
    const { data: session } = useSession();
    const isAdmin = isAdminOrAbove((session?.user?.roles ?? []) as string[]);

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
        if (submitting) return;
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
        <div className={`modal-overlay ${styles.overlay}`} onClick={onClose}>
            <div className={`modal ${styles.modal}`} onClick={_e => _e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Détails des lots — {itemName}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <p>Chargement...</p>
                    ) : (
                        <>
                            <div className={styles.noDateBox}>
                                <strong>{batches.find(b => b.expiryDate === null)?.quantity || 0}</strong> items sans date de péremption
                            </div>

                            {batches.length > 0 && (
                                <table className={styles.table}>
                                    <thead>
                                        <tr className={styles.headRow}>
                                            <th className={styles.headCell}>Date de péremption</th>
                                            <th className={styles.headCellRight}>Quantité</th>
                                            {isAdmin && <th className={styles.headCellAction}>Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {batches.map(batch => {
                                            const expired = isExpired(batch.expiryDate);
                                            return (
                                                <tr
                                                    key={batch.id}
                                                    className={styles.row}
                                                    style={{ background: expired ? 'rgba(220,38,38,0.05)' : undefined }}
                                                >
                                                    <td className={styles.dateCell}>
                                                        <span style={{
                                                            fontWeight: expired ? 600 : 400,
                                                            color: expired ? 'var(--status-maintenance)' : undefined,
                                                        }}>
                                                            {formatDate(batch.expiryDate)}
                                                            {expired && ' ⚠️ Périmé'}
                                                        </span>
                                                    </td>
                                                    <td className={styles.qtyCell}>
                                                        <div className={styles.qtyControls}>
                                                            {isAdmin && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleAdjustBatchQuantity(batch.id, -10)}
                                                                        disabled={adjustingBatch[batch.id] || batch.quantity < 10}
                                                                        className={`${styles.qtyBtn} ${styles.qtyBtnTen}`}
                                                                        title="-10"
                                                                    >
                                                                        -10
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleAdjustBatchQuantity(batch.id, -1)}
                                                                        disabled={adjustingBatch[batch.id] || batch.quantity <= 0}
                                                                        className={`${styles.qtyBtn} ${styles.qtyBtnUnit}`}
                                                                        title="-1"
                                                                    >
                                                                        -
                                                                    </button>
                                                                </>
                                                            )}
                                                            <span className={styles.qtyValue}>{batch.quantity}</span>
                                                            {isAdmin && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleAdjustBatchQuantity(batch.id, 1)}
                                                                        disabled={adjustingBatch[batch.id]}
                                                                        className={`${styles.qtyBtn} ${styles.qtyBtnUnit}`}
                                                                        title="+1"
                                                                    >
                                                                        +
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleAdjustBatchQuantity(batch.id, 10)}
                                                                        disabled={adjustingBatch[batch.id]}
                                                                        className={`${styles.qtyBtn} ${styles.qtyBtnTen}`}
                                                                        title="+10"
                                                                    >
                                                                        +10
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {isAdmin && (
                                                        <td className={styles.actionCell}>
                                                            {expired && (
                                                                <button
                                                                    onClick={() => handleDeleteBatch(batch)}
                                                                    disabled={deleting[batch.id]}
                                                                    className={styles.deleteBtn}
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

                            <div className={styles.addBatchBox}>
                                <h3 className={styles.addBatchTitle}>Ajouter une date de péremption</h3>
                                <form onSubmit={handleAddBatch}>
                                    <div className={styles.fieldRow}>
                                        <div className={styles.fieldDate}>
                                            <label className={styles.fieldLabel}>Date</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={newExpiryDate}
                                                onChange={e => setNewExpiryDate(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className={styles.fieldQty}>
                                            <label className={styles.fieldLabel}>Qté</label>
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
                                    <div className={styles.checkboxRow}>
                                        <label className={styles.checkboxLabel}>
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
                                        className={`btn btn-primary ${styles.submitBtn}`}
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
