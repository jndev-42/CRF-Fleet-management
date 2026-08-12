'use client';

import { useEffect, useState } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface ExpiringItem {
    batchId: string;
    quantity: number;
    expiryDate: string;
    itemId: string;
    itemName: string;
    category: string | null;
}

interface ExpiringSoonModalProps {
    stockId?: string;
    onClose: () => void;
    onOpenBatches: (itemId: string, itemName: string) => void;
}

export default function ExpiringSoonModal({ stockId, onClose, onOpenBatches }: ExpiringSoonModalProps) {
    useEscapeKey(onClose);
    const [items, setItems] = useState<ExpiringItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchExpiring() {
            try {
                const url = stockId ? `/api/inventory/expiring-soon?stockId=${encodeURIComponent(stockId)}` : '/api/inventory/expiring-soon';
                const res = await fetch(url);
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
    }, [stockId]);

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    };

    const isExpired = (dateStr: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return new Date(dateStr) < today;
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
                        <>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                Cliquez sur une ligne pour voir le détail des lots.
                            </p>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-primary)' }}>
                                            <th style={{ padding: '8px' }}>Article</th>
                                            <th style={{ padding: '8px' }}>Catégorie</th>
                                            <th style={{ padding: '8px' }}>Péremption</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>Quantité</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map(item => {
                                            const expired = isExpired(item.expiryDate);
                                            return (
                                                <tr
                                                    key={item.batchId}
                                                    onClick={() => {
                                                        onClose();
                                                        onOpenBatches(item.itemId, item.itemName);
                                                    }}
                                                    style={{
                                                        borderBottom: '1px solid var(--border-primary)',
                                                        cursor: 'pointer',
                                                        background: expired ? 'rgba(220,38,38,0.06)' : undefined,
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = expired ? 'rgba(220,38,38,0.12)' : 'var(--bg-hover, rgba(0,0,0,0.04))')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = expired ? 'rgba(220,38,38,0.06)' : '')}
                                                    title={`Voir les lots de « ${item.itemName} »`}
                                                >
                                                    <td style={{ padding: '8px', fontWeight: 500 }}>
                                                        {item.itemName}
                                                        <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>→</span>
                                                    </td>
                                                    <td style={{ padding: '8px', fontSize: '0.85rem' }}>{item.category || '-'}</td>
                                                    <td style={{
                                                        padding: '8px',
                                                        color: expired ? '#dc2626' : '#d97706',
                                                        fontWeight: 600,
                                                    }}>
                                                        {formatDate(item.expiryDate)}
                                                        {expired && ' ⚠️ PÉRIMÉ'}
                                                    </td>
                                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                                                        {item.quantity}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
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
