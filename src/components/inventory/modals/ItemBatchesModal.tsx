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

    useEffect(() => {
        async function fetchBatches() {
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
        }
        fetchBatches();
    }, [itemId]);

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
                    ) : batches.length === 0 ? (
                        <p>Aucun lot trouvé pour cet article.</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                </div>
            </div>
        </div>
    );
}
