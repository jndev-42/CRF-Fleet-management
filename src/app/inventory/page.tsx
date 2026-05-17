'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AddItemModal from '@/components/inventory/modals/AddItemModal';
import InventoryHistoryModal from '@/components/inventory/modals/InventoryHistoryModal';
import styles from './page.module.css';

interface InvItem {
    id: string;
    name: string;
    category: string | null;
    quantity: number;
    updatedAt: string;
}

interface Pagination {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

export default function InventoryPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [items, setItems] = useState<InvItem[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [showAddItem, setShowAddItem] = useState(false);
    const [historyItemId, setHistoryItemId] = useState<string | null>(null);
    const [adjusting, setAdjusting] = useState<Record<string, boolean>>({});
    const [customChanges, setCustomChanges] = useState<Record<string, string>>({});

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    const userRoles = (session?.user?.roles ?? ['GUEST']) as string[];
    const isAdmin = userRoles.includes('ADMIN');

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            params.set('page', page.toString());
            params.set('pageSize', '20');

            const res = await fetch(`/api/inventory?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setItems(data.items);
                setPagination(data.pagination);
            }
        } catch (e) {
            console.error('Erreur fetch inventaire:', e);
        } finally {
            setLoading(false);
        }
    }, [search, page]);

    useEffect(() => {
        if (status === 'authenticated') {
            fetchInventory();
        }
    }, [status, fetchInventory]);

    const handleAdjust = async (itemId: string, change: number) => {
        if (adjusting[itemId]) return;
        if (change === 0) return;

        setAdjusting(prev => ({ ...prev, [itemId]: true }));
        try {
            const res = await fetch('/api/inventory/adjust', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    itemId, 
                    change, 
                    note: change > 0 ? `Ajout manuel (${change})` : `Retrait manuel (${Math.abs(change)})` 
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setItems(prev => prev.map(item =>
                    item.id === itemId ? { ...item, quantity: data.newQuantity } : item
                ));
                // Clear custom input
                setCustomChanges(prev => ({ ...prev, [itemId]: '' }));
            }
        } catch (e) {
            console.error('Erreur ajustement stock:', e);
        } finally {
            setAdjusting(prev => ({ ...prev, [itemId]: false }));
        }
    };

    if (status === 'loading') {
        return <div className={styles.page}><p>Chargement...</p></div>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>Inventaire du Stock</h1>
                {isAdmin && (
                    <button className="btn btn-primary" onClick={() => setShowAddItem(true)}>
                        + Nouvel article
                    </button>
                )}
            </div>

            <div className={styles.toolbar}>
                <input
                    className="form-input"
                    style={{ maxWidth: 400 }}
                    placeholder="Rechercher un matériel (nom, catégorie)..."
                    value={search}
                    onChange={e => {
                        setSearch(e.target.value);
                        setPage(1);
                    }}
                />
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Nom</th>
                            <th>Catégorie</th>
                            <th>Quantité</th>
                            {isAdmin && <th>Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && items.length === 0 ? (
                            <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>Chargement...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>Aucun article trouvé</td></tr>
                        ) : (
                            items.map(item => (
                                <tr key={item.id}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                                        <button
                                            className={styles.historyBtn}
                                            onClick={() => setHistoryItemId(item.id)}
                                        >
                                            Voir l&apos;historique
                                        </button>
                                    </td>
                                    <td><span className={styles.categoryBadge}>{item.category || 'Général'}</span></td>
                                    <td style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                                        {item.quantity}
                                    </td>
                                    {isAdmin && (
                                        <td>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ minWidth: '32px', padding: '4px 8px' }}
                                                    onClick={() => handleAdjust(item.id, -1)}
                                                    disabled={adjusting[item.id] || item.quantity <= 0}
                                                >
                                                    -1
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ minWidth: '32px', padding: '4px 8px' }}
                                                    onClick={() => handleAdjust(item.id, 1)}
                                                    disabled={adjusting[item.id]}
                                                >
                                                    +1
                                                </button>
                                                
                                                <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        style={{ width: '60px', padding: '4px 8px', height: '32px' }}
                                                        placeholder="Qté"
                                                        value={customChanges[item.id] || ''}
                                                        onChange={e => setCustomChanges(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                    />
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{ padding: '4px 8px', height: '32px', fontSize: '0.8rem' }}
                                                        disabled={adjusting[item.id] || !customChanges[item.id]}
                                                        onClick={() => {
                                                            const val = parseInt(customChanges[item.id]);
                                                            if (!isNaN(val)) handleAdjust(item.id, val);
                                                        }}
                                                    >
                                                        Ok
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
                <div className={styles.pagination}>
                    <button
                        className="btn btn-secondary"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                    >
                        Précédent
                    </button>
                    <span>Page {page} sur {pagination.totalPages}</span>
                    <button
                        className="btn btn-secondary"
                        disabled={page === pagination.totalPages}
                        onClick={() => setPage(p => p + 1)}
                    >
                        Suivant
                    </button>
                </div>
            )}

            <AddItemModal
                isOpen={showAddItem}
                onClose={() => setShowAddItem(false)}
                onSuccess={() => { setShowAddItem(false); fetchInventory(); }}
            />

            {historyItemId && (
                <InventoryHistoryModal
                    itemId={historyItemId}
                    itemName={items.find(i => i.id === historyItemId)?.name || ''}
                    onClose={() => setHistoryItemId(null)}
                />
            )}
        </div>
    );
}
