'use client';

import { useEffect, useState } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface LowStockItem {
    id: string;
    name: string;
    category: string | null;
    quantity: number;
    minStock: number;
}

interface LowStockModalProps {
    stockId?: string;
    onClose: () => void;
    onOpenBatches: (itemId: string, itemName: string) => void;
}

export default function LowStockModal({ stockId, onClose, onOpenBatches }: LowStockModalProps) {
    useEscapeKey(onClose);
    const [items, setItems] = useState<LowStockItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const url = stockId ? `/api/inventory/low-stock?stockId=${encodeURIComponent(stockId)}` : '/api/inventory/low-stock';
        fetch(url)
            .then(r => { if (!r.ok) throw new Error(`Erreur HTTP ${r.status}`); return r.json(); })
            .then(d => setItems(d.items ?? []))
            .catch(e => console.error(e))
            .finally(() => setLoading(false));
    }, [stockId]);

    const deficit = (item: LowStockItem) => item.minStock - item.quantity;

    const deficitColor = (item: LowStockItem) => {
        const ratio = item.quantity / item.minStock;
        if (ratio <= 0) return 'var(--status-maintenance)';      // rouge — stock vide
        if (ratio < 0.5) return 'var(--status-inuse)';     // orange — moins de 50 %
        return '#854d0e';                       // brun foncé — entre 50 % et 100 %
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', width: '90%' }}>
                <div className="modal-header">
                    <h2 className="modal-title">📦 Stock faible</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <p>Chargement...</p>
                    ) : items.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--status-available)' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✅</div>
                            <p>Tous les stocks sont au-dessus du seuil minimum.</p>
                        </div>
                    ) : (
                        <>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                {items.length} article{items.length > 1 ? 's' : ''} en dessous du stock minimum.
                                Cliquez sur une ligne pour voir les lots.
                            </p>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-primary)' }}>
                                            <th style={{ padding: '8px 10px' }}>Article</th>
                                            <th style={{ padding: '8px 10px' }}>Catégorie</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Stock actuel</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Minimum</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Déficit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map(item => (
                                            <tr
                                                key={item.id}
                                                onClick={() => {
                                                    onClose();
                                                    onOpenBatches(item.id, item.name);
                                                }}
                                                style={{
                                                    borderBottom: '1px solid var(--border-primary)',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.15s',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.04))')}
                                                onMouseLeave={e => (e.currentTarget.style.background = '')}
                                                title={`Voir les lots de « ${item.name} »`}
                                            >
                                                <td style={{ padding: '10px', fontWeight: 500 }}>
                                                    {item.name}
                                                    <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>→</span>
                                                </td>
                                                <td style={{ padding: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                    {item.category || '—'}
                                                </td>
                                                <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700, fontSize: '1.05rem', color: deficitColor(item) }}>
                                                    {item.quantity}
                                                </td>
                                                <td style={{ padding: '10px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                    {item.minStock}
                                                </td>
                                                <td style={{ padding: '10px', textAlign: 'center' }}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        background: deficitColor(item),
                                                        color: '#fff',
                                                        borderRadius: '12px',
                                                        padding: '2px 10px',
                                                        fontWeight: 700,
                                                        fontSize: '0.85rem',
                                                        minWidth: '36px',
                                                    }}>
                                                        -{deficit(item)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
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
