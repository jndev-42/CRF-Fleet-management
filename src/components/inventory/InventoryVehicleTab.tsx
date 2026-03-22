'use client';

import { useEffect, useState, useCallback } from 'react';
import { InvStock, InvLocation } from '@/app/inventory/types';
import SacCard from './SacCard';
import InventoryItemRow from './InventoryItemRow';
import TransferModal from './modals/TransferModal';
import ResupplyModal from './modals/ResupplyModal';
import CheckupModal from './modals/CheckupModal';
import EditItemModal from './modals/EditItemModal';
import EditSacModal from './modals/EditSacModal';
import styles from './InventoryVehicleTab.module.css';

interface InventoryVehicleTabProps {
    vehicleId: string;
    userRoles: string[];
}

interface TemplateEntry {
    itemId: string;
    targetQty: number;
    itemName: string;
    unit: string;
}

interface SacWithStock extends InvLocation {
    stock: InvStock[];
    template: TemplateEntry[];
    templateId: string | null;
}

interface VehicleInventory {
    vehicleLocation: { id: string; name: string } | null;
    sacs: SacWithStock[];
    directStock: InvStock[];
}

interface LocationOption {
    id: string;
    name: string;
    type: string;
}

interface Vehicle {
    id: string;
    name: string;
}

export default function InventoryVehicleTab({ vehicleId, userRoles }: InventoryVehicleTabProps) {
    const [data, setData] = useState<VehicleInventory | null>(null);
    const [loading, setLoading] = useState(true);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [pharmaCount, setPharmaCount] = useState(0);
    const [showCheckup, setShowCheckup] = useState(false);
    const [showResupply, setShowResupply] = useState(false);
    const [transferTarget, setTransferTarget] = useState<{ item?: InvStock } | null>(null);
    const [editTarget, setEditTarget] = useState<InvStock | null>(null);
    const [editSacTarget, setEditSacTarget] = useState<SacWithStock | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(`/api/inventory/vehicle/${vehicleId}`);
            if (res.ok) {
                const json = await res.json() as VehicleInventory;
                setData(json);
            }
        } catch (e) {
            console.error('Erreur fetch inventaire véhicule:', e);
        } finally {
            setLoading(false);
        }
    }, [vehicleId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        fetch('/api/vehicles')
            .then(r => r.json())
            .then((list: Vehicle[]) => setVehicles(Array.isArray(list) ? list : []))
            .catch(console.error);
    }, []);

    // Vérifie si la Pharmacie Tampon a des articles disponibles
    useEffect(() => {
        fetch('/api/inventory?location=PHARMA_TAMPON')
            .then(r => r.json())
            .then((json: { stock?: InvStock[] }) => {
                setPharmaCount(Array.isArray(json.stock) ? json.stock.length : 0);
            })
            .catch(console.error);
    }, []);

    async function toggleSacSeal(sac: SacWithStock) {
        try {
            const res = await fetch(`/api/inventory/sacs/${sac.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isSealed: !sac.isSealed }),
            });
            if (res.ok) fetchData();
        } catch (e) {
            console.error('Erreur toggle scellé:', e);
        }
    }

    function handleItemUpdated(updated: InvStock) {
        setData(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                directStock: prev.directStock.map(i => i.id === updated.id ? updated : i),
                sacs: prev.sacs.map(sac => ({
                    ...sac,
                    stock: sac.stock.map(i => i.id === updated.id ? updated : i),
                })),
            };
        });
        setEditTarget(null);
    }

    async function handleConsume(item: InvStock) {
        if (item.quantity <= 0) return;
        try {
            const res = await fetch(`/api/inventory/items/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity: item.quantity - 1 }),
            });
            if (res.ok) {
                const updated = await res.json() as InvStock;
                handleItemUpdated(updated);
            }
        } catch (e) {
            console.error('Erreur consommation article:', e);
        }
    }

    if (loading) {
        return <div className={styles.loading}>Chargement de l&apos;inventaire...</div>;
    }

    const sacs = data?.sacs ?? [];
    const directStock = data?.directStock ?? [];
    const vehicleLocId = data?.vehicleLocation?.id ?? null;

    function itemNeedsResupply(i: InvStock) {
        return i.status === 'MANQUANT' ||
            (i.criticalThreshold != null && i.quantity < i.criticalThreshold);
    }
    const hasMissingItems = directStock.some(itemNeedsResupply) ||
        sacs.some(sac => !sac.isSealed && sac.stock.some(itemNeedsResupply));
    const reapproDisabled = pharmaCount === 0 || !hasMissingItems;
    const reapproTitle = pharmaCount === 0
        ? 'Aucun article disponible en Pharmacie Tampon'
        : !hasMissingItems
            ? 'Inventaire complet — aucun article manquant'
            : `Réapprovisionner depuis la Pharmacie Tampon (${pharmaCount} article${pharmaCount > 1 ? 's' : ''} disponible${pharmaCount > 1 ? 's' : ''})`;

    // Emplacements disponibles pour TransferModal
    const locationOptions: LocationOption[] = [
        ...(vehicleLocId ? [{ id: vehicleLocId, name: 'Véhicule (direct)', type: 'VEHICLE' }] : []),
        ...sacs.map(s => ({ id: s.id, name: s.name, type: 'SAC' })),
    ];

    return (
        <div className={styles.tab}>
            <div className={styles.actions}>
                <button className="btn btn-secondary" onClick={() => setShowCheckup(true)}>
                    ✅ Check-up de garde
                </button>
                <button
                    className="btn btn-secondary"
                    onClick={() => setShowResupply(true)}
                    disabled={reapproDisabled}
                    title={reapproTitle}
                    style={{ opacity: reapproDisabled ? 0.5 : 1, cursor: reapproDisabled ? 'not-allowed' : 'pointer' }}
                >
                    📦 Réapprovisionner depuis Tampon
                </button>
            </div>

            {sacs.length > 0 && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Sacs ({sacs.length})</h3>
                    {sacs.map(sac => (
                        <SacCard
                            key={sac.id}
                            sac={{
                                ...sac,
                                templateEntries: sac.template.length > 0 ? sac.template : undefined,
                            }}
                            onToggleSeal={() => toggleSacSeal(sac)}
                            onTransfer={() => { /* sac transfer handled via transfer modal */ }}
                            onConsumeItem={handleConsume}
                            onEdit={s => setEditSacTarget(s as SacWithStock)}
                            userRoles={userRoles}
                        />
                    ))}
                </section>
            )}

            {directStock.length > 0 && (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Matériel nu ({directStock.length})</h3>
                    {directStock.map(item => (
                        <InventoryItemRow
                            key={item.id}
                            item={item}
                            onTransfer={() => setTransferTarget({ item })}
                            onEdit={() => setEditTarget(item)}
                            onDelete={() => { /* deletion not exposed in vehicle tab */ }}
                            onConsume={handleConsume}
                            userRoles={userRoles}
                        />
                    ))}
                </section>
            )}

            {sacs.length === 0 && directStock.length === 0 && (
                <div className={styles.empty}>
                    <p>Aucun inventaire assigné à ce véhicule.</p>
                </div>
            )}

            {showCheckup && (
                <CheckupModal
                    isOpen
                    onClose={() => setShowCheckup(false)}
                    vehicleId={vehicleId}
                    sacs={sacs}
                    directStock={directStock}
                    onSuccess={() => { setShowCheckup(false); fetchData(); }}
                />
            )}

            {showResupply && (
                <ResupplyModal
                    isOpen
                    onClose={() => setShowResupply(false)}
                    onSuccess={() => { setShowResupply(false); fetchData(); }}
                    vehicleId={vehicleId}
                    vehicleName={vehicles.find(v => v.id === vehicleId)?.name ?? vehicleId}
                />
            )}

            {transferTarget?.item && (
                <TransferModal
                    isOpen
                    onClose={() => setTransferTarget(null)}
                    onSuccess={() => { setTransferTarget(null); fetchData(); }}
                    item={transferTarget.item}
                    locations={locationOptions}
                    userRoles={userRoles}
                />
            )}

            {editTarget && (
                <EditItemModal
                    isOpen
                    onClose={() => setEditTarget(null)}
                    onSuccess={handleItemUpdated}
                    item={editTarget}
                />
            )}

            {editSacTarget && (
                <EditSacModal
                    isOpen
                    onClose={() => setEditSacTarget(null)}
                    onSuccess={() => { setEditSacTarget(null); fetchData(); }}
                    sac={editSacTarget}
                    userRoles={userRoles}
                />
            )}
        </div>
    );
}
