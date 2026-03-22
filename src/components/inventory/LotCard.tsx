'use client';

import { useState } from 'react';
import { InventoryLot, InventoryItem } from '@/app/inventory/types';
import EditLotModal from './modals/EditLotModal';
import styles from './LotCard.module.css';

interface LotCardProps {
    lot: InventoryLot;
    onToggleSeal: () => void;
    onTransfer: () => void;
    onConsumeItem?: (item: InventoryItem) => void;
    onRefresh?: () => void;
    userRoles: string[];
}

const SECOURISTE_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

function getLocationLabel(lot: InventoryLot): string {
    if (lot.vehicleName) return lot.vehicleName;
    if (lot.stockLocation === 'STOCK_CENTRAL') return 'Stock Central';
    if (lot.stockLocation === 'PHARMA_TAMPON') return 'Pharma Tampon';
    return '—';
}

export default function LotCard({ lot, onToggleSeal, onTransfer, onConsumeItem, onRefresh, userRoles }: LotCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [showEditLot, setShowEditLot] = useState(false);
    const canManage = userRoles.some(r => SECOURISTE_ROLES.includes(r));

    return (
        <div className={styles.card}>
            <div className={styles.cardHeader} onClick={() => setExpanded(e => !e)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}>
                <div className={styles.cardTitle}>
                    <span className={styles.lotName}>{lot.name}</span>
                    {lot.isSealed && <span className={styles.sealedBadge}>Scellé</span>}
                </div>
                <div className={styles.cardMeta}>
                    <span className={styles.location}>{getLocationLabel(lot)}</span>
                    <span className={styles.itemCount}>{lot.itemCount ?? lot.items?.length ?? 0} article{(lot.itemCount ?? 0) !== 1 ? 's' : ''}</span>
                    <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
                </div>
            </div>

            {expanded && (
                <div className={styles.cardBody}>
                    {lot.items && lot.items.length > 0 ? (
                        <ul className={styles.itemList}>
                            {lot.items.map(item => {
                                const low = item.criticalThreshold != null && item.quantity < item.criticalThreshold;
                                return (
                                <li key={item.id} className={styles.itemLine}>
                                    <span className={styles.itemLineName}>{item.itemName}</span>
                                    <span className={styles.itemLineQty} style={{ color: low ? 'var(--status-maintenance)' : undefined, fontWeight: low ? 600 : undefined }}>
                                        {item.quantity}{item.criticalThreshold != null ? `/${item.criticalThreshold}` : ''} {item.unit}
                                        {low && <span style={{ marginLeft: 4, fontSize: 11 }}>⚠️</span>}
                                    </span>
                                    {item.status !== 'OK' && (
                                        <span className={styles.itemStatusBadge} style={{
                                            color: item.status === 'HORS_SERVICE' ? 'var(--status-maintenance)' : 'var(--status-inuse)'
                                        }}>
                                            {item.status === 'HORS_SERVICE' ? 'Hors service' : 'Manquant'}
                                        </span>
                                    )}
                                    {onConsumeItem && canManage && (
                                        <button
                                            className="btn btn-secondary"
                                            style={{ fontSize: 12, padding: '2px 8px', marginLeft: 'auto' }}
                                            disabled={item.quantity <= 0}
                                            title={item.quantity <= 0 ? 'Quantité déjà à 0' : 'Marquer comme utilisé (−1)'}
                                            onClick={() => onConsumeItem(item)}
                                        >
                                            −1
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                        </ul>
                    ) : (
                        <p className={styles.emptyItems}>Aucun article dans ce lot</p>
                    )}
                </div>
            )}

            {canManage && (
                <div className={styles.cardActions}>
                    <button className="btn btn-secondary" style={{ fontSize: 13, padding: '4px 10px' }} onClick={onTransfer}>
                        Transférer
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 13, padding: '4px 10px' }} onClick={onToggleSeal}>
                        {lot.isSealed ? 'Desceller' : 'Sceller'}
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 13, padding: '4px 10px' }} onClick={() => { setExpanded(true); setShowEditLot(true); }}>
                        ✏️ Contenu
                    </button>
                </div>
            )}

            {showEditLot && (
                <EditLotModal
                    isOpen
                    lot={lot}
                    onClose={() => setShowEditLot(false)}
                    onSuccess={() => { setShowEditLot(false); onRefresh?.(); }}
                />
            )}
        </div>
    );
}
