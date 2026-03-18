'use client';

import { useState, useEffect } from 'react';
import { InvStock } from '@/app/inventory/types';

interface ResupplyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    vehicleId: string;
    vehicleName: string;
}

interface SacOption {
    id: string;
    name: string;
    stock: { itemId: string; quantity: number }[];
    template: { itemId: string; targetQty: number }[];
}

interface VehicleInventory {
    sacs?: SacOption[];
}

function computeTransferQty(stock: InvStock, sac: SacOption): number {
    const currentInSac = sac.stock.find(s => s.itemId === stock.itemId)?.quantity ?? 0;
    const templateEntry = sac.template.find(t => t.itemId === stock.itemId);
    const needed = templateEntry != null
        ? Math.max(0, templateEntry.targetQty - currentInSac)
        : stock.quantity;
    return Math.min(stock.quantity, needed);
}

export default function ResupplyModal({ isOpen, onClose, onSuccess, vehicleId, vehicleName }: ResupplyModalProps) {
    const [pharmaStock, setPharmaStock] = useState<InvStock[]>([]);
    const [vehicleSacs, setVehicleSacs] = useState<SacOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [itemDestinations, setItemDestinations] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setItemDestinations({});
            return;
        }
        setLoading(true);
        Promise.all([
            fetch('/api/inventory?location=PHARMA_TAMPON').then(r => r.json()),
            fetch(`/api/inventory/vehicle/${vehicleId}`).then(r => r.json()),
        ])
            .then(([pharma, vehicle]: [
                { stock?: InvStock[] },
                VehicleInventory
            ]) => {
                setPharmaStock(Array.isArray(pharma.stock) ? pharma.stock : []);
                setVehicleSacs(Array.isArray(vehicle.sacs) ? vehicle.sacs : []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [isOpen, vehicleId]);

    if (!isOpen) return null;

    const nothingSelected = Object.values(itemDestinations).every(v => !v);

    function setItemDest(stockId: string, locationId: string) {
        setItemDestinations(prev => ({ ...prev, [stockId]: locationId }));
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSubmitting(true);

        const transfers: Promise<Response>[] = [];

        for (const [stockId, destLocationId] of Object.entries(itemDestinations)) {
            if (!destLocationId) continue;
            const stock = pharmaStock.find(s => s.id === stockId);
            if (!stock) continue;

            const sac = vehicleSacs.find(s => s.id === destLocationId);
            const transferQty = sac ? computeTransferQty(stock, sac) : stock.quantity;
            if (transferQty === 0) continue;

            transfers.push(
                fetch('/api/inventory/transfer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transferType: 'item',
                        itemId: stock.itemId,
                        fromLocationId: stock.locationId,
                        toLocationId: destLocationId,
                        qty: transferQty,
                    }),
                })
            );
        }

        try {
            const results = await Promise.all(transfers);
            const failed = results.filter(r => !r.ok);
            if (failed.length > 0) {
                const data = await failed[0].json() as { error?: string };
                alert(data.error || 'Erreur lors du transfert');
            } else {
                onSuccess();
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="modal-header">
                    <h2 className="modal-title">Réapprovisionner depuis Pharmacie Tampon</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                            Destination : <strong>{vehicleName}</strong>
                        </p>

                        {loading && (
                            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p>
                        )}

                        {!loading && pharmaStock.length === 0 && (
                            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 14 }}>
                                Aucun article disponible en Pharmacie Tampon.
                            </p>
                        )}

                        {!loading && pharmaStock.length > 0 && (
                            <div>
                                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                    Articles disponibles ({pharmaStock.length})
                                </h3>
                                {vehicleSacs.length === 0 ? (
                                    <p style={{ fontSize: 13, color: 'var(--color-warning, #f59e0b)', fontStyle: 'italic', padding: '8px 0' }}>
                                        Ce véhicule n&apos;a pas de sacs. Créez des sacs avant de réapprovisionner.
                                    </p>
                                ) : (
                                    pharmaStock.map(stock => {
                                        const selectedSacId = itemDestinations[stock.id];
                                        const selectedSac = vehicleSacs.find(s => s.id === selectedSacId);
                                        const transferQty = selectedSac ? computeTransferQty(stock, selectedSac) : null;
                                        const isComplete = transferQty === 0;

                                        return (
                                            <div
                                                key={stock.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    padding: '8px 0',
                                                    borderBottom: '1px solid var(--border-primary)',
                                                    opacity: isComplete ? 0.6 : 1,
                                                }}
                                            >
                                                <span style={{ flex: 1, fontSize: 14 }}>
                                                    {stock.itemName}
                                                    {transferQty !== null && (
                                                        isComplete ? (
                                                            <span style={{ marginLeft: 8, fontSize: 11, background: 'var(--color-success-bg, #d1fae5)', color: 'var(--color-success, #065f46)', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>
                                                                Déjà complet
                                                            </span>
                                                        ) : (
                                                            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                                                → {transferQty} {stock.unit}
                                                            </span>
                                                        )
                                                    )}
                                                </span>
                                                <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    {stock.quantity} {stock.unit}
                                                    {stock.category && <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>· {stock.category}</span>}
                                                </span>
                                                <select
                                                    value={itemDestinations[stock.id] ?? ''}
                                                    onChange={e => setItemDest(stock.id, e.target.value)}
                                                    style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', minWidth: 140 }}
                                                >
                                                    <option value="">— Choisir un sac —</option>
                                                    {vehicleSacs.map(sac => (
                                                        <option key={sac.id} value={sac.id}>{sac.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={submitting || nothingSelected || loading}
                        >
                            {submitting ? 'Transfert...' : `Transférer vers ${vehicleName}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
