'use client';

import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import styles from './LowStockModal.module.css';

interface LowStockItem {
    id: string;
    name: string;
    category: string | null;
    quantity: number;
    minStock: number;
    orderedAt: string | null;
}

interface LowStockModalProps {
    stockId?: string;
    canManage?: boolean;
    onClose: () => void;
    onOpenBatches: (itemId: string, itemName: string) => void;
}

/** Horodatage UTC (« 2026-11-15 10:30:00 » ou ISO) → « 15/11 » à l'heure de Paris (repli « — » si illisible). */
function formatOrderedDay(orderedAt: string): string {
    const iso = orderedAt.replace(' ', 'T');
    const date = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
}

export default function LowStockModal({ stockId, canManage = false, onClose, onOpenBatches }: LowStockModalProps) {
    useEscapeKey(onClose);
    const [items, setItems] = useState<LowStockItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const url = stockId ? `/api/inventory/low-stock?stockId=${encodeURIComponent(stockId)}` : '/api/inventory/low-stock';
        fetch(url)
            .then(r => { if (!r.ok) throw new Error(`Erreur HTTP ${r.status}`); return r.json(); })
            .then(d => setItems(d.items ?? []))
            .catch(e => console.error(e))
            .finally(() => setLoading(false));
    }, [stockId]);

    const toggleOrdered = async (item: LowStockItem) => {
        const previous = item.orderedAt;
        const ordered = !previous;
        setError(null);
        // Mise à jour optimiste, annulée en cas d'échec.
        const apply = (orderedAt: string | null) =>
            setItems(list => list.map(i => (i.id === item.id ? { ...i, orderedAt } : i)));
        apply(ordered ? new Date().toISOString() : null);
        try {
            const res = await fetch('/api/inventory/low-stock', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: item.id, ordered }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`);
            apply(data.orderedAt ?? null);
        } catch (e: unknown) {
            console.error(e);
            apply(previous);
            setError(e instanceof Error ? e.message : 'Erreur lors du marquage');
        }
    };

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
                            {error && <p className={styles.error} role="alert">{error}</p>}
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr className={styles.headRow}>
                                            <th className={styles.headCell}>Article</th>
                                            <th className={styles.headCell}>Catégorie</th>
                                            <th className={styles.headCellCenter}>Stock actuel</th>
                                            <th className={styles.headCellCenter}>Minimum</th>
                                            <th className={styles.headCellCenter}>Déficit</th>
                                            <th className={styles.headCellCenter}>Commande</th>
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
                                                <td className={styles.orderCell}>
                                                    {canManage ? (
                                                        <button
                                                            type="button"
                                                            aria-pressed={!!item.orderedAt}
                                                            className={item.orderedAt ? `${styles.orderBtn} ${styles.orderBtnActive}` : styles.orderBtn}
                                                            onClick={e => { e.stopPropagation(); toggleOrdered(item); }}
                                                            title={item.orderedAt ? 'Retirer le repère « commandé »' : 'Marquer comme commandé'}
                                                        >
                                                            <Truck size={14} />
                                                            {item.orderedAt ? `Commandé le ${formatOrderedDay(item.orderedAt)}` : 'Marquer commandé'}
                                                        </button>
                                                    ) : item.orderedAt ? (
                                                        <span className={`${styles.orderBtn} ${styles.orderBtnActive} ${styles.orderBadge}`}>
                                                            <Truck size={14} />
                                                            Commandé le {formatOrderedDay(item.orderedAt)}
                                                        </span>
                                                    ) : null}
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
