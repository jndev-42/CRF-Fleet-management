'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AddItemModal from '@/components/inventory/modals/AddItemModal';
import EditItemModal from '@/components/inventory/modals/EditItemModal';
import InventoryHistoryModal from '@/components/inventory/modals/InventoryHistoryModal';
import ItemBatchesModal from '@/components/inventory/modals/ItemBatchesModal';
import ExpiringSoonModal from '@/components/inventory/modals/ExpiringSoonModal';
import LowStockModal from '@/components/inventory/modals/LowStockModal';
import StockTabs from '@/components/inventory/StockTabs';
import StockModal from '@/components/inventory/modals/StockModal';
import { InvStockListRow } from '@/lib/inventory/stocks';
import { isAdminOrAbove } from '@/lib/roles';
import styles from './page.module.css';

interface InvItem {
    id: string;
    name: string;
    category: string | null;
    quantity: number;
    notes: string | null;
    updatedAt: string;
    nearestExpiry: string | null;
    minStock: number | null;
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

    const [stocks, setStocks] = useState<InvStockListRow[]>([]);
    const [activeStockId, setActiveStockId] = useState<string>('');
    const [stockModalState, setStockModalState] = useState<{
        isOpen: boolean;
        mode: 'create' | 'rename';
        stockToRename?: InvStockListRow;
    }>({ isOpen: false, mode: 'create' });

    const [items, setItems] = useState<InvItem[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [categories, setCategories] = useState<string[]>([]);
    const [showAddItem, setShowAddItem] = useState(false);
    const [showExpiringSoon, setShowExpiringSoon] = useState(false);
    const [showLowStock, setShowLowStock] = useState(false);
    const [editItem, setEditItem] = useState<InvItem | null>(null);
    const [historyItemId, setHistoryItemId] = useState<string | null>(null);
    const [batchItemId, setBatchItemId] = useState<string | null>(null);
    const [batchItemName, setBatchItemName] = useState('');
    const [adjusting, setAdjusting] = useState<Record<string, boolean>>({});
    const [customChanges, setCustomChanges] = useState<Record<string, string>>({});
    const [deleting, setDeleting] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    // Charger les stocks
    useEffect(() => {
        if (status !== 'authenticated') return;
        fetch('/api/inventory/stocks')
            .then(r => r.json())
            .then(d => {
                const list: InvStockListRow[] = d.stocks ?? [];
                setStocks(list);
                if (list.length > 0 && !activeStockId) {
                    setActiveStockId(list[0].id);
                }
            })
            .catch(e => console.error('Erreur fetch stocks:', e));
    }, [status, activeStockId]);

    // Charger la liste des catégories à chaque changement de stock actif
    useEffect(() => {
        if (status !== 'authenticated' || !activeStockId) return;
        fetch(`/api/inventory?categoriesOnly=1&stockId=${encodeURIComponent(activeStockId)}`)
            .then(r => r.json())
            .then(d => setCategories(d.categories ?? []))
            .catch(() => {});
    }, [status, activeStockId]);

    const userRoles = (session?.user?.roles ?? ['GUEST']) as string[];
    const isAdmin = isAdminOrAbove(userRoles);

    const fetchInventory = useCallback(async () => {
        if (!activeStockId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('stockId', activeStockId);
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
    }, [search, categoryFilter, page, activeStockId]);

    useEffect(() => {
        if (status === 'authenticated' && activeStockId) {
            fetchInventory();
        }
    }, [status, activeStockId, fetchInventory]);

    const handleCreateStock = async (name: string) => {
        const res = await fetch('/api/inventory/stocks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (res.ok) {
            const newStock = await res.json();
            setStocks(prev => [...prev, newStock]);
            setActiveStockId(newStock.id);
            setSearch('');
            setCategoryFilter('');
            setPage(1);
        } else {
            const data = await res.json();
            throw new Error(data.error || 'Erreur lors de la création du stock');
        }
    };

    const handleRenameStock = async (name: string) => {
        if (!stockModalState.stockToRename) return;
        const stockId = stockModalState.stockToRename.id;
        const res = await fetch('/api/inventory/stocks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: stockId, name }),
        });
        if (res.ok) {
            setStocks(prev => prev.map(s => s.id === stockId ? { ...s, name } : s));
        } else {
            const data = await res.json();
            throw new Error(data.error || 'Erreur lors du renommage du stock');
        }
    };

    const handleDeleteStock = async (stockToDelete: InvStockListRow) => {
        if (!confirm(`Supprimer le stock "${stockToDelete.name}" ?\nATTENTION : Cette action supprimera TOUS les articles qu'il contient.`)) return;

        try {
            const res = await fetch(`/api/inventory/stocks?id=${stockToDelete.id}`, { method: 'DELETE' });
            if (res.ok) {
                const updated = stocks.filter(s => s.id !== stockToDelete.id);
                setStocks(updated);
                if (activeStockId === stockToDelete.id) {
                    setActiveStockId(updated[0]?.id || '');
                    setSearch('');
                    setCategoryFilter('');
                    setPage(1);
                }
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de la suppression du stock');
            }
        } catch {
            alert('Erreur de connexion');
        }
    };

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

    function getExpiryDisplay(dateStr: string | null): { label: string; color: string } {
        if (!dateStr) return { label: '—', color: 'inherit' };
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = new Date(dateStr);
        expiry.setHours(0, 0, 0, 0);
        const diffMs = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        const year = expiry.getFullYear();
        const month = String(expiry.getMonth() + 1).padStart(2, '0');
        const day = String(expiry.getDate()).padStart(2, '0');
        const label = `${year}/${month}/${day}`;

        if (diffDays < 0) return { label, color: '#dc2626' };    // rouge — périmé
        if (diffDays <= 31) return { label, color: '#d97706' };   // orange — ≤ 1 mois
        return { label, color: '#16a34a' };                        // vert — > 1 mois
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>Inventaire du Stock</h1>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={() => setShowLowStock(true)}>
                        📦 Stock faible
                    </button>
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

            {stocks.length > 0 && (
                <StockTabs
                    stocks={stocks}
                    activeStockId={activeStockId}
                    isAdmin={isAdmin}
                    onSelectStock={id => {
                        setActiveStockId(id);
                        setSearch('');
                        setCategoryFilter('');
                        setPage(1);
                    }}
                    onOpenCreate={() => setStockModalState({ isOpen: true, mode: 'create' })}
                    onOpenRename={stock => setStockModalState({ isOpen: true, mode: 'rename', stockToRename: stock })}
                    onDeleteStock={handleDeleteStock}
                />
            )}

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
                            <th>Péremption</th>
                            {isAdmin && <th>Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && items.length === 0 ? (
                            <tr><td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', padding: '2rem' }}>Chargement...</td></tr>
                        ) : items.length === 0 ? (
                            <tr><td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', padding: '2rem' }}>Aucun article trouvé</td></tr>
                        ) : (
                            items.map(item => (
                                <tr key={item.id}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            <button
                                                className={styles.actionBtn}
                                                onClick={() => setHistoryItemId(item.id)}
                                            >
                                                🕒 Historique
                                            </button>
                                            <button
                                                className={styles.actionBtn}
                                                onClick={() => {
                                                    setBatchItemId(item.id);
                                                    setBatchItemName(item.name);
                                                }}
                                            >
                                                📅 Péremptions
                                            </button>
                                            {isAdmin && (
                                                <>
                                                    <button
                                                        className={`${styles.actionBtn} ${styles.editBtn}`}
                                                        onClick={() => setEditItem(item)}
                                                    >
                                                        ✏️ Modifier
                                                    </button>
                                                    <button
                                                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
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
                                    <td>
                                        {(() => {
                                            const { label, color } = getExpiryDisplay(item.nearestExpiry);
                                            return (
                                                <span style={{
                                                    fontWeight: color !== 'inherit' ? 600 : 400,
                                                    color,
                                                    fontSize: '0.9rem',
                                                }}>
                                                    {label}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    {isAdmin && (
                                        <td>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ minWidth: '36px', padding: '4px 8px' }}
                                                    onClick={() => handleAdjust(item.id, -10)}
                                                    disabled={adjusting[item.id] || item.quantity < 10}
                                                >
                                                    -10
                                                </button>
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
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ minWidth: '36px', padding: '4px 8px' }}
                                                    onClick={() => handleAdjust(item.id, 10)}
                                                    disabled={adjusting[item.id]}
                                                >
                                                    +10
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
                stockId={activeStockId}
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
                    itemName={batchItemName || items.find(i => i.id === batchItemId)?.name || ''}
                    onClose={() => setBatchItemId(null)}
                    onBatchDeleted={fetchInventory}
                />
            )}

            {showExpiringSoon && (
                <ExpiringSoonModal
                    stockId={activeStockId}
                    onClose={() => setShowExpiringSoon(false)}
                    onOpenBatches={(itemId, itemName) => {
                        setBatchItemId(itemId);
                        setBatchItemName(itemName);
                    }}
                />
            )}

            {showLowStock && (
                <LowStockModal
                    stockId={activeStockId}
                    onClose={() => setShowLowStock(false)}
                    onOpenBatches={(itemId, itemName) => {
                        setBatchItemId(itemId);
                        setBatchItemName(itemName);
                    }}
                />
            )}

            <StockModal
                isOpen={stockModalState.isOpen}
                mode={stockModalState.mode}
                initialName={stockModalState.stockToRename?.name || ''}
                onClose={() => setStockModalState({ isOpen: false, mode: 'create' })}
                onSubmit={stockModalState.mode === 'create' ? handleCreateStock : handleRenameStock}
            />
        </div>
    );
}
