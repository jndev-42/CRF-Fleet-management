'use client';

import { useEffect, useState } from 'react';

interface Batch {
    id: string;
    quantity: number;
    expiryDate: string | null;
}

interface ItemBatchesModalProps {
    itemId: string;
    itemName: string;
    onClose: () => void;
}

export default function ItemBatchesModal({ itemId, itemName, onClose }: ItemBatchesModalProps) {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [newExpiryDate, setNewExpiryDate] = useState('');
    const [newQuantity, setNewQuantity] = useState('');
    const [deductFromNoDate, setDeductFromNoDate] = useState(true);

    const fetchBatches = async () => {
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
    };

    useEffect(() => {
        fetchBatches();
    }, [itemId]);

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
        } catch (e) {
            alert('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Sans date';
        return new Date(dateStr).toLocaleDateString('fr-FR');
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h2 className="modal-title">Détails des lots - {itemName}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <p>Chargement...</p>
                    ) : (
                        <>
                            <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f9f9f9', borderRadius: '4px', fontSize: '0.9rem' }}>
                                <strong>{batches.find(b => b.expiryDate === null)?.quantity || 0}</strong> items sans date de péremption
                            </div>

                            {batches.length > 0 && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                                            <th style={{ padding: '8px' }}>Date de péremption</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>Quantité</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {batches.map(batch => (
                                            <tr key={batch.id} style={{ borderBottom: '1px solid #eee' }}>
                                                <td style={{ padding: '8px' }}>
                                                    {formatDate(batch.expiryDate)}
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                                                    {batch.quantity}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            <div style={{ border: '1px solid #eee', padding: '1rem', borderRadius: '8px' }}>
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
