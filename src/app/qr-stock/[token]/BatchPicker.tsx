'use client';

import { useState } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import type { QRStockItem } from './types';
import styles from './page.module.css';

interface Props {
    item: QRStockItem;
    onClose: () => void;
    /** `expiryDate === null` : stock sans date. */
    onPick: (expiryDate: string | null) => void;
}

/** Formatte une date ISO pour l'affichage, sans dépendance externe. */
function formatDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR');
}

/**
 * Sélecteur de lot pour un AJOUT : lots existants en ordre FEFO, stock sans
 * date, ou nouveau lot daté.
 *
 * Le choix n'existe qu'à l'ajout. Un retrait suit toujours le FEFO, décidé côté
 * serveur : laisser un bénévole désigner le lot à vider rendrait possible de
 * consommer le lot le plus lointain en laissant périmer le plus proche.
 */
export default function BatchPicker({ item, onClose, onPick }: Props) {
    const [newDate, setNewDate] = useState('');
    useEscapeKey(onClose);

    const hasNoDateBatch = item.batches.some(b => b.expiryDate === null);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="batch-picker-title"
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 id="batch-picker-title" className="modal-title">Ajouter à {item.name}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
                </div>

                <div className="modal-body">
                    <div className={styles.batchList}>
                        {/* La clé porte l'index : `InvBatch` n'a aucune contrainte
                            d'unicité sur `(itemId, expiryDate)`, et deux lots de même
                            date — cas que des données héritées peuvent porter — se
                            confondraient sous une clé réduite à la seule date. */}
                        {item.batches.filter(b => b.expiryDate !== null).map((batch, index) => (
                            <button
                                key={`${batch.expiryDate}-${index}`}
                                type="button"
                                className={styles.batchOption}
                                onClick={() => onPick(batch.expiryDate)}
                            >
                                <span>Lot du {formatDate(batch.expiryDate as string)}</span>
                                <span className={styles.batchQty}>{batch.quantity} en stock</span>
                            </button>
                        ))}

                        <button
                            type="button"
                            className={styles.batchOption}
                            onClick={() => onPick(null)}
                        >
                            <span>Stock sans date</span>
                            {hasNoDateBatch && (
                                <span className={styles.batchQty}>
                                    {item.batches.find(b => b.expiryDate === null)?.quantity} en stock
                                </span>
                            )}
                        </button>
                    </div>

                    <div className={styles.newBatchRow}>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label" htmlFor="new-batch-date">Nouveau lot</label>
                            <input
                                id="new-batch-date"
                                type="date"
                                className="form-input"
                                value={newDate}
                                onChange={e => setNewDate(e.target.value)}
                            />
                        </div>
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={!newDate}
                            onClick={() => onPick(newDate)}
                        >
                            Ajouter
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
