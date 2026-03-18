'use client';

import { useState } from 'react';
import { InvLocation, InvStock } from '@/app/inventory/types';
import styles from './LotCard.module.css';

interface TemplateEntry {
    itemId: string;
    itemName: string;
    unit: string;
    targetQty: number;
}

interface SacCardProps {
    sac: InvLocation & { stock: InvStock[]; vehicleName?: string | null; templateEntries?: TemplateEntry[] };
    onToggleSeal: () => void;
    onTransfer?: () => void;
    onConsumeItem?: (item: InvStock) => void;
    onEdit?: (sac: InvLocation & { stock: InvStock[] }) => void;
    userRoles: string[];
}

const SECOURISTE_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

function getLocationLabel(sac: InvLocation & { vehicleName?: string | null }): string {
    if (sac.vehicleName) return sac.vehicleName;
    if (sac.type === 'SAC' && !sac.vehicleId) return 'Pharmacie Tampon';
    return '—';
}

function getTemplateCompleteness(
    stock: InvStock[],
    templateEntries?: TemplateEntry[]
): string | null {
    if (templateEntries && templateEntries.length > 0) {
        const ok = templateEntries.filter(entry => {
            const stockItem = stock.find(s => s.itemId === entry.itemId);
            return stockItem && stockItem.quantity >= entry.targetQty;
        }).length;
        return `${ok}/${templateEntries.length} complet${ok !== templateEntries.length ? 's' : 's'}`;
    }
    // Fallback sur criticalThreshold si pas de modèle
    const withThreshold = stock.filter(s => s.criticalThreshold != null);
    if (withThreshold.length === 0) return null;
    const ok = withThreshold.filter(s => s.quantity >= (s.criticalThreshold ?? 0)).length;
    return `${ok}/${withThreshold.length} complet${ok !== withThreshold.length ? 's' : 's'}`;
}

export default function SacCard({ sac, onToggleSeal, onTransfer, onConsumeItem, onEdit, userRoles }: SacCardProps) {
    const [expanded, setExpanded] = useState(false);
    const canManage = userRoles.some(r => SECOURISTE_ROLES.includes(r));
    const templateEntries = sac.templateEntries;
    const completeness = getTemplateCompleteness(sac.stock, templateEntries);

    // Indexe le stock par itemId pour lookup rapide
    const stockByItemId = new Map<string, InvStock>(sac.stock.map(s => [s.itemId, s]));

    return (
        <div className={styles.card}>
            <div
                className={styles.cardHeader}
                onClick={() => setExpanded(e => !e)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
            >
                <div className={styles.cardTitle}>
                    <span className={styles.lotName}>{sac.name}</span>
                    {sac.isSealed && <span className={styles.sealedBadge}>Scellé</span>}
                    {sac.templateId && templateEntries && (
                        <span style={{
                            fontSize: '0.7rem',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-muted)',
                            padding: '1px 6px',
                            borderRadius: 8,
                            border: '1px solid var(--border-primary)',
                            marginLeft: 4,
                        }}>
                            modèle
                        </span>
                    )}
                </div>
                <div className={styles.cardMeta}>
                    <span className={styles.location}>{getLocationLabel(sac as InvLocation & { vehicleName?: string | null })}</span>
                    <span className={styles.itemCount}>{sac.stock.length} article{sac.stock.length !== 1 ? 's' : ''}</span>
                    {completeness && (
                        <span style={{ fontSize: '0.75rem', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 12 }}>
                            {completeness}
                        </span>
                    )}
                    <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
                </div>
            </div>

            {expanded && (
                <div className={styles.cardBody}>
                    {templateEntries && templateEntries.length > 0 ? (
                        <ul className={styles.itemList}>
                            {/* Items du modèle en premier */}
                            {templateEntries.map(entry => {
                                const stockItem = stockByItemId.get(entry.itemId);
                                const actual = stockItem?.quantity ?? 0;
                                const isOk = actual >= entry.targetQty;
                                const isMissing = actual === 0;
                                return (
                                    <li key={entry.itemId} className={styles.itemLine}>
                                        <span className={styles.itemLineName}>{entry.itemName}</span>
                                        <span
                                            className={styles.itemLineQty}
                                            style={{
                                                color: isMissing
                                                    ? 'var(--status-maintenance)'
                                                    : !isOk
                                                        ? 'var(--status-inuse)'
                                                        : 'var(--status-available)',
                                                fontWeight: !isOk ? 600 : undefined,
                                            }}
                                        >
                                            {actual}/{entry.targetQty} {entry.unit}
                                            {!isOk && <span style={{ marginLeft: 4, fontSize: 11 }}>⚠️</span>}
                                        </span>
                                        {stockItem && onConsumeItem && canManage && (
                                            <button
                                                className="btn btn-secondary"
                                                style={{ fontSize: 12, padding: '2px 8px', marginLeft: 'auto' }}
                                                disabled={stockItem.quantity <= 0}
                                                title={stockItem.quantity <= 0 ? 'Quantité déjà à 0' : 'Marquer comme utilisé (−1)'}
                                                onClick={() => onConsumeItem(stockItem)}
                                            >
                                                −1
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                            {/* Items en stock mais pas dans le modèle */}
                            {sac.stock
                                .filter(s => !templateEntries.some(e => e.itemId === s.itemId))
                                .map(item => {
                                    const low = item.criticalThreshold != null && item.quantity < item.criticalThreshold;
                                    return (
                                        <li key={item.id} className={styles.itemLine}>
                                            <span className={styles.itemLineName}>{item.itemName}</span>
                                            <span
                                                className={styles.itemLineQty}
                                                style={{
                                                    color: low ? 'var(--status-maintenance)' : undefined,
                                                    fontWeight: low ? 600 : undefined,
                                                }}
                                            >
                                                {item.quantity}{item.criticalThreshold != null ? `/${item.criticalThreshold}` : ''} {item.unit}
                                                {low && <span style={{ marginLeft: 4, fontSize: 11 }}>⚠️</span>}
                                            </span>
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
                    ) : sac.stock.length > 0 ? (
                        <ul className={styles.itemList}>
                            {sac.stock.map(item => {
                                const low = item.criticalThreshold != null && item.quantity < item.criticalThreshold;
                                return (
                                    <li key={item.id} className={styles.itemLine}>
                                        <span className={styles.itemLineName}>{item.itemName}</span>
                                        <span
                                            className={styles.itemLineQty}
                                            style={{
                                                color: low ? 'var(--status-maintenance)' : undefined,
                                                fontWeight: low ? 600 : undefined,
                                            }}
                                        >
                                            {item.quantity}{item.criticalThreshold != null ? `/${item.criticalThreshold}` : ''} {item.unit}
                                            {low && <span style={{ marginLeft: 4, fontSize: 11 }}>⚠️</span>}
                                        </span>
                                        {item.status !== 'OK' && (
                                            <span
                                                className={styles.itemStatusBadge}
                                                style={{
                                                    color: item.status === 'HORS_SERVICE' ? 'var(--status-maintenance)' : 'var(--status-inuse)',
                                                }}
                                            >
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
                        <p className={styles.emptyItems}>Aucun article dans ce sac</p>
                    )}
                </div>
            )}

            {canManage && (
                <div className={styles.cardActions}>
                    {onTransfer && (
                        <button className="btn btn-secondary" style={{ fontSize: 13, padding: '4px 10px' }} onClick={onTransfer}>
                            Transférer
                        </button>
                    )}
                    <button className="btn btn-secondary" style={{ fontSize: 13, padding: '4px 10px' }} onClick={onToggleSeal}>
                        {sac.isSealed ? 'Desceller' : 'Sceller'}
                    </button>
                    {onEdit && (
                        <button
                            className="btn btn-secondary"
                            style={{ fontSize: 13, padding: '4px 10px' }}
                            onClick={() => onEdit(sac)}
                        >
                            ✏️ Modifier
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
