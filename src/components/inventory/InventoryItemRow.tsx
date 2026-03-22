'use client';

import { InvStock } from '@/app/inventory/types';
import styles from './InventoryItemRow.module.css';

interface InventoryItemRowProps {
    item: InvStock;
    onTransfer: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onConsume?: (item: InvStock) => void;
    userRoles: string[];
}

function getExpiryBadge(expiryDate: string | null): { label: string; className: string } | null {
    if (!expiryDate) return null;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return { label: 'Expiré', className: styles.badgeExpired };
    if (diffDays <= 30) return { label: `J-${diffDays}`, className: styles.badgeExpiringSoon };
    if (diffDays <= 90) return { label: `J-${diffDays}`, className: styles.badgeExpiringWarning };
    return { label: expiryDate, className: styles.badgeOk };
}

function getStatusBadge(status: string): string {
    if (status === 'HORS_SERVICE') return styles.badgeHorsService;
    if (status === 'MANQUANT') return styles.badgeManquant;
    return styles.badgeOkStatus;
}

function getLocationLabel(item: InvStock): string {
    if (item.vehicleName) return item.vehicleName;
    if (item.locationType === 'STOCK_CENTRAL') return 'Stock Central';
    if (item.locationType === 'PHARMA_TAMPON') return 'Pharma Tampon';
    if (item.locationType === 'SAC') return `Sac : ${item.locationName}`;
    return item.locationName ?? '—';
}

const SECOURISTE_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

export default function InventoryItemRow({ item, onTransfer, onEdit, onDelete, onConsume, userRoles }: InventoryItemRowProps) {
    const canEdit = userRoles.some(r => SECOURISTE_ROLES.includes(r));
    const canDelete = userRoles.includes('ADMIN');
    const expiryBadge = getExpiryBadge(item.expiryDate);

    return (
        <div className={styles.row}>
            <div className={styles.rowMain}>
                <div className={styles.rowInfo}>
                    <div className={styles.itemName}>{item.itemName}</div>
                    <div className={styles.itemMeta}>
                        {item.sku && <span className={styles.sku}>{item.sku}</span>}
                        {item.category && <span className={styles.category}>{item.category}</span>}
                        <span className={styles.location}>{getLocationLabel(item)}</span>
                    </div>
                </div>
                <div className={styles.rowBadges}>
                    <span className={styles.quantity}>{item.quantity} {item.unit}</span>
                    {expiryBadge && (
                        <span className={`${styles.badge} ${expiryBadge.className}`} title={`Péremption: ${item.expiryDate}`}>
                            {expiryBadge.label}
                        </span>
                    )}
                    {item.status !== 'OK' && (
                        <span className={`${styles.badge} ${getStatusBadge(item.status)}`}>
                            {item.status === 'HORS_SERVICE' ? 'Hors service' : 'Manquant'}
                        </span>
                    )}
                </div>
            </div>
            <div className={styles.rowActions}>
                {onConsume && canEdit && (
                    <button
                        className="btn btn-secondary"
                        style={{ fontSize: 13, padding: '4px 10px' }}
                        onClick={() => onConsume(item)}
                        disabled={item.quantity <= 0}
                        title={item.quantity <= 0 ? 'Quantité déjà à 0' : 'Marquer comme utilisé (−1)'}
                    >
                        −1
                    </button>
                )}
                <button className="btn btn-secondary" style={{ fontSize: 13, padding: '4px 10px' }} onClick={onTransfer}>
                    Transférer
                </button>
                {canEdit && (
                    <button className="btn btn-secondary" style={{ fontSize: 13, padding: '4px 10px' }} onClick={onEdit}>
                        ✏️
                    </button>
                )}
                {canDelete && (
                    <button
                        className="btn btn-secondary"
                        style={{ fontSize: 13, padding: '4px 10px', color: 'var(--status-maintenance)' }}
                        onClick={onDelete}
                    >
                        🗑️
                    </button>
                )}
            </div>
        </div>
    );
}
