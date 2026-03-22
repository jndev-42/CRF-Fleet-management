'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { InvStock, InvLocation, InvGroupe, InventoryKPIs } from './types';
import InventoryDashboard from '@/components/inventory/InventoryDashboard';
import InventoryItemRow from '@/components/inventory/InventoryItemRow';
import SacCard from '@/components/inventory/SacCard';
import AddItemModal from '@/components/inventory/modals/AddItemModal';
import AddSacModal from '@/components/inventory/modals/AddSacModal';
import AddGroupeModal from '@/components/inventory/modals/AddGroupeModal';
import TransferModal from '@/components/inventory/modals/TransferModal';
import EditItemModal from '@/components/inventory/modals/EditItemModal';
import EditSacModal from '@/components/inventory/modals/EditSacModal';
import EditGroupeModal from '@/components/inventory/modals/EditGroupeModal';
import BagTemplateListModal from '@/components/inventory/modals/BagTemplateListModal';
import styles from './page.module.css';

interface TemplateEntry {
    itemId: string;
    itemName: string;
    unit: string;
    targetQty: number;
}

interface SacWithTemplate extends InvLocation {
    stock: InvStock[];
    vehicleName?: string | null;
    templateEntries?: TemplateEntry[];
}

interface InventoryData {
    kpis: InventoryKPIs;
    stock: InvStock[];
    groupes: (InvGroupe & { sacs: InvLocation[] })[];
    sacs: SacWithTemplate[];
    pharmaAlerts: InvStock[];
}

interface VehicleOption {
    id: string;
    name: string;
}

interface InvLocationOption {
    id: string;
    name: string;
    type: string;
}

export default function InventoryPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [data, setData] = useState<InventoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [locationFilter, setLocationFilter] = useState('all');
    const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
    const [invLocations, setInvLocations] = useState<InvLocationOption[]>([]);
    const [showAddItem, setShowAddItem] = useState(false);
    const [showAddSac, setShowAddSac] = useState(false);
    const [showAddGroupe, setShowAddGroupe] = useState(false);
    const [showBagTemplateList, setShowBagTemplateList] = useState(false);
    const [transferTarget, setTransferTarget] = useState<{ item?: InvStock } | null>(null);
    const [editTarget, setEditTarget] = useState<InvStock | null>(null);
    const [editSacTarget, setEditSacTarget] = useState<SacWithTemplate | null>(null);
    const [editGroupeTarget, setEditGroupeTarget] = useState<InvGroupe | null>(null);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    const userRoles = (session?.user?.roles ?? ['GUEST']) as string[];
    const canWrite = userRoles.includes('SECOURISTE');
    const isAdmin = userRoles.includes('ADMIN');

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (locationFilter !== 'all') params.set('location', locationFilter);
            const res = await fetch(`/api/inventory?${params.toString()}`);
            if (res.ok) {
                const json = await res.json() as InventoryData;
                setData(json);
            }
        } catch (e) {
            console.error('Erreur fetch inventaire:', e);
        } finally {
            setLoading(false);
        }
    }, [search, locationFilter]);

    useEffect(() => {
        if (status === 'authenticated') {
            fetchInventory();
        }
    }, [status, fetchInventory]);

    useEffect(() => {
        if (status !== 'authenticated') return;
        fetch('/api/vehicles')
            .then(r => r.json())
            .then((list: VehicleOption[]) => setVehicles(Array.isArray(list) ? list : []))
            .catch(console.error);
    }, [status]);

    // Charge les emplacements pour la modale AddItemModal
    useEffect(() => {
        if (status !== 'authenticated') return;
        fetch('/api/inventory?location=all')
            .then(r => r.json())
            .then((json: { sacs?: InvLocation[] }) => {
                const locs: InvLocationOption[] = [
                    { id: 'loc-stock-central', name: 'Stock Central', type: 'STOCK_CENTRAL' },
                    { id: 'loc-pharma-tampon', name: 'Pharmacie Tampon', type: 'PHARMA_TAMPON' },
                    ...(Array.isArray(json.sacs) ? json.sacs.map(s => ({ id: s.id, name: s.name, type: 'SAC' })) : []),
                ];
                setInvLocations(locs);
            })
            .catch(console.error);
    }, [status]);

    if (status === 'loading' || (status === 'authenticated' && loading && !data)) {
        return (
            <div className={styles.page}>
                <div className="empty-state">
                    <div className="empty-state-title">Chargement...</div>
                </div>
            </div>
        );
    }

    const kpis: InventoryKPIs = data?.kpis ?? { expiringSoon: 0, horsService: 0, pharmaAlerts: 0, fleetCompleteness: 0 };
    const pharmaAlerts = data?.pharmaAlerts ?? [];

    // Onglets de localisation
    const vehicleTabs = vehicles.map(v => ({ key: `vehicle:${v.id}`, label: v.name }));
    const locationTabs = [
        { key: 'all', label: 'Tous' },
        { key: 'STOCK_CENTRAL', label: 'Stock Central' },
        { key: 'PHARMA_TAMPON', label: 'Pharmacie Tampon' },
        ...vehicleTabs,
    ];

    // Filtre les sacs par onglet actif
    const filteredSacs = (data?.sacs ?? []).filter(sac => {
        if (locationFilter === 'all') return true;
        if (locationFilter === 'PHARMA_TAMPON') {
            return sac.type === 'SAC' && sac.parentId === 'loc-pharma-tampon';
        }
        if (locationFilter?.startsWith('vehicle:')) {
            const vehicleId = locationFilter.replace('vehicle:', '');
            return sac.vehicleId === vehicleId;
        }
        return false;
    });

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>Inventaire médical</h1>
                {canWrite && (
                    <div className={styles.headerActions}>
                        <button className="btn btn-primary" onClick={() => setShowAddItem(true)}>
                            + Ajouter stock
                        </button>
                        <button className="btn btn-secondary" onClick={() => setShowAddSac(true)}>
                            + Créer sac
                        </button>
                        <button className="btn btn-secondary" onClick={() => setShowAddGroupe(true)}>
                            + Créer groupe
                        </button>
                        {isAdmin && (
                            <button className="btn btn-secondary" onClick={() => setShowBagTemplateList(true)}>
                                Gérer modèles
                            </button>
                        )}
                    </div>
                )}
            </div>

            <InventoryDashboard kpis={kpis} pharmaAlerts={pharmaAlerts} />

            <div className={styles.toolbar}>
                <input
                    className="form-input"
                    style={{ maxWidth: 280 }}
                    placeholder="Rechercher par nom ou référence..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            <div className={styles.locationTabs} role="tablist">
                {locationTabs.map(tab => (
                    <button
                        key={tab.key}
                        role="tab"
                        aria-selected={locationFilter === tab.key}
                        className={`${styles.locationTab}${locationFilter === tab.key ? ` ${styles.locationTabActive}` : ''}`}
                        onClick={() => setLocationFilter(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading && <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p>}

            {!loading && data && (
                <>
                    {filteredSacs.length > 0 && (
                        <section style={{ marginBottom: 24 }}>
                            <h2 className={styles.sectionTitle}>Sacs ({filteredSacs.length})</h2>
                            {filteredSacs.map(sac => (
                                <SacCard
                                    key={sac.id}
                                    sac={sac}
                                    onToggleSeal={async () => {
                                        await fetch(`/api/inventory/sacs/${sac.id}`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ isSealed: !sac.isSealed }),
                                        });
                                        fetchInventory();
                                    }}
                                    onEdit={s => setEditSacTarget(s as SacWithTemplate)}
                                    userRoles={userRoles}
                                />
                            ))}
                        </section>
                    )}

                    {data.groupes.length > 0 && locationFilter === 'all' && (
                        <section style={{ marginBottom: 24 }}>
                            <h2 className={styles.sectionTitle}>Groupes ({data.groupes.length})</h2>
                            {data.groupes.map(groupe => (
                                <div key={groupe.id} style={{
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '12px 16px',
                                    marginBottom: 12,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                                        <span style={{ fontWeight: 600, fontSize: 15 }}>{groupe.name}</span>
                                        <button
                                            className="btn btn-secondary"
                                            style={{ fontSize: 12, padding: '3px 8px', marginLeft: 'auto' }}
                                            onClick={() => setEditGroupeTarget(groupe)}
                                        >
                                            ✏️ Modifier
                                        </button>
                                    </div>
                                    {groupe.description && (
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{groupe.description}</div>
                                    )}
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                        {groupe.sacs.length} sac{groupe.sacs.length !== 1 ? 's' : ''} :&nbsp;
                                        {groupe.sacs.map(s => s.name).join(', ') || '—'}
                                    </div>
                                </div>
                            ))}
                        </section>
                    )}

                    {data.stock.length > 0 && (
                        <section>
                            <h2 className={styles.sectionTitle}>Articles ({data.stock.length})</h2>
                            {data.stock.map(item => (
                                <InventoryItemRow
                                    key={item.id}
                                    item={item}
                                    onTransfer={() => setTransferTarget({ item })}
                                    onEdit={() => setEditTarget(item)}
                                    onDelete={async () => {
                                        if (!window.confirm(`Supprimer "${item.itemName}" ?`)) return;
                                        await fetch(`/api/inventory/items/${item.id}`, { method: 'DELETE' });
                                        fetchInventory();
                                    }}
                                    userRoles={userRoles}
                                />
                            ))}
                        </section>
                    )}

                    {filteredSacs.length === 0 && data.stock.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">📦</div>
                            <div className="empty-state-title">Aucun article trouvé</div>
                        </div>
                    )}
                </>
            )}

            <AddItemModal
                isOpen={showAddItem}
                onClose={() => setShowAddItem(false)}
                onSuccess={() => { setShowAddItem(false); fetchInventory(); }}
                locations={invLocations}
            />
            <AddSacModal
                isOpen={showAddSac}
                onClose={() => setShowAddSac(false)}
                onSuccess={() => { setShowAddSac(false); fetchInventory(); }}
                vehicles={vehicles}
                userRoles={userRoles}
            />
            <AddGroupeModal
                isOpen={showAddGroupe}
                onClose={() => setShowAddGroupe(false)}
                onSuccess={() => { setShowAddGroupe(false); fetchInventory(); }}
            />
            <BagTemplateListModal
                isOpen={showBagTemplateList}
                onClose={() => setShowBagTemplateList(false)}
            />
            {transferTarget?.item && (
                <TransferModal
                    isOpen
                    onClose={() => setTransferTarget(null)}
                    onSuccess={() => { setTransferTarget(null); fetchInventory(); }}
                    item={transferTarget.item}
                    locations={invLocations}
                    userRoles={userRoles}
                />
            )}
            {editTarget && (
                <EditItemModal
                    isOpen
                    onClose={() => setEditTarget(null)}
                    onSuccess={() => { setEditTarget(null); fetchInventory(); }}
                    item={editTarget}
                />
            )}
            {editSacTarget && (
                <EditSacModal
                    isOpen
                    onClose={() => setEditSacTarget(null)}
                    onSuccess={() => { setEditSacTarget(null); fetchInventory(); }}
                    sac={editSacTarget}
                    userRoles={userRoles}
                />
            )}
            {editGroupeTarget && (
                <EditGroupeModal
                    isOpen
                    onClose={() => setEditGroupeTarget(null)}
                    onSuccess={() => { setEditGroupeTarget(null); fetchInventory(); }}
                    groupe={editGroupeTarget}
                    availableSacs={(data?.sacs ?? []) as InvLocation[]}
                />
            )}
        </div>
    );
}
