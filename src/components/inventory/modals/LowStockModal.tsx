'use client';

import { useEffect, useState } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import styles from './LowStockModal.module.css';

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
        <div className={`modal-overlay ${styles.overlay}`} onClick={onClose}>
            <div className={`modal ${styles.modal}`} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">📦 Stock faible</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <p>Chargement...</p>
                    ) : items.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>✅</div>
                            <p>Tous les stocks sont au-dessus du seuil minimum.</p>
                        </div>
                    ) : (
                        <>
                            <p className={styles.hint}>
                                {items.length} article{items.length > 1 ? 's' : ''} en dessous du stock minimum.
                                Cliquez sur une ligne pour voir les lots.
                            </p>
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr className={styles.headRow}>
                                            <th className={styles.headCell}>Article</th>
                                            <th className={styles.headCell}>Catégorie</th>
                                            <th className={styles.headCellCenter}>Stock actuel</th>
                                            <th className={styles.headCellCenter}>Minimum</th>
                                            <th className={styles.headCellCenter}>Déficit</th>
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
                                                className={styles.row}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.04))')}
                                                onMouseLeave={e => (e.currentTarget.style.background = '')}
                                                title={`Voir les lots de « ${item.name} »`}
                                            >
                                                <td className={styles.nameCell}>
                                                    {item.name}
                                                    <span className={styles.arrow}>→</span>
                                                </td>
                                                <td className={styles.categoryCell}>
                                                    {item.category || '—'}
                                                </td>
                                                <td className={styles.quantityCell} style={{ color: deficitColor(item) }}>
                                                    {item.quantity}
                                                </td>
                                                <td className={styles.minStockCell}>
                                                    {item.minStock}
                                                </td>
                                                <td className={styles.deficitCell}>
                                                    <span className={styles.deficitBadge} style={{ background: deficitColor(item) }}>
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
