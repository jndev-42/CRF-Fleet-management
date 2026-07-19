'use client';

import React from 'react';
import { InvStockListRow } from '@/lib/inventory/stocks';
import styles from './StockTabs.module.css';

interface StockTabsProps {
    stocks: InvStockListRow[];
    activeStockId: string;
    isAdmin: boolean;
    onSelectStock: (stockId: string) => void;
    onOpenCreate: () => void;
    onOpenRename: (stock: InvStockListRow) => void;
    onDeleteStock: (stock: InvStockListRow) => void;
}

export default function StockTabs({
    stocks,
    activeStockId,
    isAdmin,
    onSelectStock,
    onOpenCreate,
    onOpenRename,
    onDeleteStock,
}: StockTabsProps) {
    return (
        <div className={styles.tabsContainer}>
            <div className={styles.tabsList} role="tablist">
                {stocks.map(stock => {
                    const isActive = stock.id === activeStockId;
                    return (
                        <div
                            key={stock.id}
                            role="tab"
                            aria-selected={isActive}
                            className={`${styles.tabItem} ${isActive ? styles.tabActive : ''}`}
                            onClick={() => onSelectStock(stock.id)}
                        >
                            <span className={styles.tabIcon}>📦</span>
                            <span className={styles.tabName}>{stock.name}</span>

                            {isAdmin && (
                                <div className={styles.tabActions} onClick={e => e.stopPropagation()}>
                                    <button
                                        type="button"
                                        className={styles.tabActionButton}
                                        title="Renommer le stock"
                                        onClick={() => onOpenRename(stock)}
                                    >
                                        ✏️
                                    </button>
                                    {stocks.length > 1 && (
                                        <button
                                            type="button"
                                            className={`${styles.tabActionButton} ${styles.tabDeleteButton}`}
                                            title="Supprimer le stock"
                                            onClick={() => onDeleteStock(stock)}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {isAdmin && (
                    <button
                        type="button"
                        className={styles.addTabButton}
                        onClick={onOpenCreate}
                        title="Créer un nouveau stock"
                    >
                        <span>+</span>
                        <span className={styles.addTabText}>Nouveau stock</span>
                    </button>
                )}
            </div>
        </div>
    );
}
