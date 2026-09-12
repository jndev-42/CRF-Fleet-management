'use client';

import type { QRStockItem } from './types';
import styles from './page.module.css';

interface Props {
    item: QRStockItem;
    /** Retrait immédiat : FEFO côté serveur, aucun choix de lot à faire. */
    onRemove: (item: QRStockItem) => void;
    /** Ajout : ouvre le sélecteur de lot. */
    onAdd: (item: QRStockItem) => void;
}

/**
 * Une ligne d'article : nom, quantité, et les deux seules actions possibles.
 *
 * Aucun bouton de création, d'édition ou de suppression d'article — le
 * périmètre de la page est volontairement fermé (cf. `AGENTS.md`).
 */
export default function StockItemRow({ item, onRemove, onAdd }: Props) {
    const isLow = item.minStock !== null && item.quantity <= item.minStock;

    return (
        <div className={styles.itemRow}>
            <div className={styles.itemInfo}>
                <div className={styles.itemName}>{item.name}</div>
                {item.category && <div className={styles.itemMeta}>{item.category}</div>}
            </div>

            <div className={`${styles.itemQuantity} ${isLow ? styles.low : ''}`}>
                {item.quantity}
            </div>

            <div className={styles.stepper}>
                <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() => onRemove(item)}
                    disabled={item.quantity <= 0}
                    aria-label={`Retirer une unité de ${item.name}`}
                >
                    −
                </button>
                {/*
                  Le « + » reste ACTIF à quantité nulle : un article épuisé est
                  précisément celui qu'on vient réapprovisionner.
                */}
                <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() => onAdd(item)}
                    aria-label={`Ajouter une unité de ${item.name}`}
                >
                    +
                </button>
            </div>
        </div>
    );
}
