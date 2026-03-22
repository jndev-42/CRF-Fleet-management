'use client';

import { useState } from 'react';
import { InvLocation, InvStock } from '@/app/inventory/types';

interface SacWithStock extends InvLocation {
    stock: InvStock[];
}

interface CheckupModalProps {
    isOpen: boolean;
    onClose: () => void;
    vehicleId: string;
    sacs: SacWithStock[];
    directStock: InvStock[];
    onSuccess: () => void;
}

type CheckState = Record<string, boolean>;

export default function CheckupModal({ isOpen, onClose, sacs, directStock, onSuccess }: CheckupModalProps) {
    const [checked, setChecked] = useState<CheckState>({});
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    function toggle(id: string) {
        setChecked(prev => ({ ...prev, [id]: !prev[id] }));
    }

    function isChecked(id: string) {
        return checked[id] === true;
    }

    // Collect items that were NOT checked off → mark MANQUANT
    const missingStockIds: string[] = [];
    const missingSacIds: string[] = [];

    for (const sac of sacs) {
        if (sac.isSealed) {
            if (!isChecked(`sac-${sac.id}`)) missingSacIds.push(sac.id);
        } else {
            for (const stock of sac.stock) {
                if (!isChecked(`stock-${stock.id}`)) missingStockIds.push(stock.id);
            }
        }
    }
    for (const stock of directStock) {
        if (!isChecked(`direct-${stock.id}`)) missingStockIds.push(stock.id);
    }

    const totalMissing = missingStockIds.length + missingSacIds.length;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        try {
            // Mark missing InvStock as MANQUANT
            for (const stockId of missingStockIds) {
                await fetch(`/api/inventory/items/${stockId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'MANQUANT' }),
                });
            }

            // Unseal sacs that were not confirmed present
            for (const sacId of missingSacIds) {
                await fetch(`/api/inventory/sacs/${sacId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isSealed: false }),
                });
            }

            onSuccess();
        } catch {
            alert('Erreur lors du check-up');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="modal-header">
                    <h2 className="modal-title">Mode Check-up de garde</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                            Cochez les articles présents. Les non-cochés seront marqués <strong>Manquant</strong>.
                        </p>

                        {sacs.map(sac => (
                            <div key={sac.id} style={{ marginBottom: 16 }}>
                                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: 'var(--text-primary)' }}>
                                    {sac.name} {sac.isSealed && <span style={{ fontSize: 11, color: 'var(--crf-red)' }}>[Scellé]</span>}
                                </div>
                                {sac.isSealed ? (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked(`sac-${sac.id}`)}
                                            onChange={() => toggle(`sac-${sac.id}`)}
                                            style={{ width: 16, height: 16, accentColor: 'var(--crf-red)' }}
                                        />
                                        Sac complet [scellé]
                                    </label>
                                ) : (
                                    sac.stock.map(stock => (
                                        <label key={stock.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, padding: '4px 0' }}>
                                            <input
                                                type="checkbox"
                                                checked={isChecked(`stock-${stock.id}`)}
                                                onChange={() => toggle(`stock-${stock.id}`)}
                                                style={{ width: 16, height: 16, accentColor: 'var(--crf-red)' }}
                                            />
                                            {stock.itemName} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>({stock.quantity} {stock.unit})</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        ))}

                        {directStock.length > 0 && (
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: 'var(--text-primary)' }}>Matériel direct</div>
                                {directStock.map(stock => (
                                    <label key={stock.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, padding: '4px 0' }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked(`direct-${stock.id}`)}
                                            onChange={() => toggle(`direct-${stock.id}`)}
                                            style={{ width: 16, height: 16, accentColor: 'var(--crf-red)' }}
                                        />
                                        {stock.itemName} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>({stock.quantity} {stock.unit})</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {sacs.length === 0 && directStock.length === 0 && (
                            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 14 }}>
                                Aucun article assigné à ce véhicule.
                            </p>
                        )}
                    </div>

                    {totalMissing > 0 && (
                        <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: 'var(--status-maintenance-bg)', border: '1px solid var(--status-maintenance)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--status-maintenance)' }}>
                            ⚠️ <strong>{totalMissing} matériel{totalMissing > 1 ? 's' : ''} manquant{totalMissing > 1 ? 's' : ''}</strong> détecté{totalMissing > 1 ? 's' : ''}
                        </div>
                    )}

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Enregistrement...' : 'Valider le check-up'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
