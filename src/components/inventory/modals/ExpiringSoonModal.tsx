'use client';

import { useEffect, useState } from 'react';

interface ExpiringItem {
    batchId: string;
    quantity: number;
    expiryDate: string;
    itemId: string;
    itemName: string;
    category: string | null;
}

interface ExpiringSoonModalProps {
    onClose: () => void;
}

export default function ExpiringSoonModal({ onClose }: ExpiringSoonModalProps) {
    const [items, setItems] = useState<ExpiringItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchExpiring() {
            try {
                const res = await fetch('/api/inventory/expiring-soon');
                if (res.ok) {
                    const data = await res.json();
                    setItems(data.items);
                }
            } catch (e) {
                console.error('Erreur fetch expiring:', e);
            } finally {
                setLoading(false);
            }
        }
        fetchExpiring();
    }, []);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('fr-FR');
    };

    const isExpired = (dateStr: string) => {
        return new Date(dateStr) < new Date();
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', width: '90%' }}>
                <div className="modal-header">
                    <h2 className="modal-title">Périmé bientôt (sous 1 mois)</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <p>Chargement...</p>
                    ) : items.length === 0 ? (
                        <p>Aucun article ne périme bientôt.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                                        <th style={{ padding: '8px' }}>Article</th>
                                        <th style={{ padding: '8px' }}>Catégorie</th>
                                        <th style={{ padding: '8px' }}>Péremption</th>
                                        <th style={{ padding: '8px', textAlign: 'right' }}>Quantité</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => (
                                        <tr key={item.batchId} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={{ padding: '8px', fontWeight: 500 }}>{item.itemName}</td>
                                            <td style={{ padding: '8px', fontSize: '0.85rem' }}>{item.category || '-'}</td>
                                            <td style={{
                                                padding: '8px',
                                                color: isExpired(item.expiryDate) ? '#dc3545' : '#856404',
                                                fontWeight: 600
                                            }}>
                                                {formatDate(item.expiryDate)}
                                                {isExpired(item.expiryDate) && ' (PÉRIMÉ)'}
                                            </td>
                                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                                                {item.quantity}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                </div>
            </div>
        </div>
    );
}
