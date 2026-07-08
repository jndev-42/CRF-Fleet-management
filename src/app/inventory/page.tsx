'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AddItemModal from '@/components/inventory/modals/AddItemModal';
import EditItemModal from '@/components/inventory/modals/EditItemModal';
import InventoryHistoryModal from '@/components/inventory/modals/InventoryHistoryModal';
import ItemBatchesModal from '@/components/inventory/modals/ItemBatchesModal';
import ExpiringSoonModal from '@/components/inventory/modals/ExpiringSoonModal';
import styles from './page.module.css';

interface InvItem {
    id: string;
    name: string;
    category: string | null;
    quantity: number;
    notes: string | null;
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
    const [categoryFilter, setCategoryFilter] = useState('');
    const [categories, setCategories] = useState<string[]>([]);
    const [showAddItem, setShowAddItem] = useState(false);
    const [showExpiringSoon, setShowExpiringSoon] = useState(false);
    const [editItem, setEditItem] = useState<InvItem | null>(null);
    const [historyItemId, setHistoryItemId] = useState<string | null>(null);
    const [batchItemId, setBatchItemId] = useState<string | null>(null);
    const [adjusting, setAdjusting] = useState<Record<string, boolean>>({});
    const [customChanges, setCustomChanges] = useState<Record<string, string>>({});
    const [deleting, setDeleting] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    // Charger la liste des catégories une seule fois
    useEffect(() => {
        if (status !== 'authenticated') return;
        fetch('/api/inventory?categoriesOnly=1')
            .then(r => r.json())
            .then(d => setCategories(d.categories ?? []))
            .catch(() => {});
    }, [status]);

    const userRoles = (session?.user?.roles ?? ['GUEST']) as string[];
    const isAdmin = userRoles.includes('ADMIN');

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (categoryFilter) params.set('category', categoryFilter);
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
    }, [search, categoryFilter, page]);

    useEffect(() => {
        if (status === 'authenticated') {
            fetchInventory();
        }
    }, [status, fetchInventory]);

    const handleDelete = async (item: InvItem) => {
        if (!confirm(`Supprimer l'article "${item.name}" ? Cette action est irréversible.`)) return;
        setDeleting(prev => ({ ...prev, [item.id]: true }));
        try {
            const res = await fetch(`/api/inventory?id=${item.id}`, { method: 'DELETE' });
            if (res.ok) {
                setItems(prev => prev.filter(i => i.id !== item.id));
            } else {
                const data = await res.json() as { error?: string };
                alert(data.error || 'Erreur lors de la suppression');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setDeleting(prev => ({ ...prev, [item.id]: false }));
        }
    };

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
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={() => setShowExpiringSoon(true)}>
                        ⚠️ Périmé bientôt
                    </button>
                    {isAdmin && (
                        <button className="btn btn-primary" onClick={() => setShowAddItem(true)}>
                            + Nouvel article
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.toolbar}>
                <input
                    className="form-input"
                    style={{ maxWidth: 360 }}
                    placeholder="Rechercher un matériel (nom, catégorie)..."
                    value={search}
                    onChange={e => {
                        setSearch(e.target.value);
                        setPage(1);
                    }}
                />

                {categories.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                            onClick={() => { setCategoryFilter(''); setPage(1); }}
                            style={{
                                padding: '5px 14px',
                                borderRadius: '20px',
                                border: '1.5px solid',
                                borderColor: categoryFilter === '' ? 'var(--primary, #2563eb)' : 'var(--border, #e2e8f0)',
                                background: categoryFilter === '' ? 'var(--primary, #2563eb)' : 'transparent',
                                color: categoryFilter === '' ? '#fff' : 'inherit',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                transition: 'all 0.15s',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            Tous
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat as string}
                                onClick={() => { setCategoryFilter(cat as string); setPage(1); }}
                                style={{
                                    padding: '5px 14px',
                                    borderRadius: '20px',
                                    border: '1.5px solid',
                                    borderColor: categoryFilter === cat ? 'var(--primary, #2563eb)' : 'var(--border, #e2e8f0)',
                                    background: categoryFilter === cat ? 'var(--primary, #2563eb)' : 'transparent',
                                    color: categoryFilter === cat ? '#fff' : 'inherit',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    transition: 'all 0.15s',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {cat as string}
                            </button>
                        ))}
                    </div>
                )}
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
                                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                            <button
                                                className={styles.historyBtn}
                                                onClick={() => setHistoryItemId(item.id)}
                                            >
                                                Historique
                                            </button>
                                            <button
                                                className={styles.historyBtn}
                                                onClick={() => setBatchItemId(item.id)}
                                            >
                                                Péremptions
                                            </button>
                                            {isAdmin && (
                                                <>
                                                    <button
                                                        className={styles.historyBtn}
                                                        style={{ color: 'var(--primary, #2563eb)' }}
                                                        onClick={() => setEditItem(item)}
                                                    >
                                                        ✏️ Modifier
                                                    </button>
                                                    <button
                                                        className={styles.historyBtn}
                                                        style={{ color: 'var(--danger, #dc2626)' }}
                                                        onClick={() => handleDelete(item)}
                                                        disabled={deleting[item.id]}
                                                    >
                                                        🗑️ Supprimer
                                                    </button>
                                                </>
                                            )}
                                        </div>
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
                onSuccess={() => { fetchInventory(); }}
            />

            <EditItemModal
                isOpen={editItem !== null}
                item={editItem}
                onClose={() => setEditItem(null)}
                onSuccess={() => { setEditItem(null); fetchInventory(); }}
            />

            {historyItemId && (
                <InventoryHistoryModal
                    itemId={historyItemId}
                    itemName={items.find(i => i.id === historyItemId)?.name || ''}
                    onClose={() => setHistoryItemId(null)}
                />
            )}

            {batchItemId && (
                <ItemBatchesModal
                    itemId={batchItemId}
                    itemName={items.find(i => i.id === batchItemId)?.name || ''}
                    onClose={() => setBatchItemId(null)}
                />
            )}

            {showExpiringSoon && (
                <ExpiringSoonModal
                    onClose={() => setShowExpiringSoon(false)}
                />
            )}
        </div>
    );
}
