'use client';

import type { QRStockItem } from './types';
import styles from './page.module.css';

interface Props {
    item: QRStockItem;
    /** Somme des mouvements déjà empilés pour cet article, 0 si aucun. */
    pending: number;
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
export default function StockItemRow({ item, pending, onRemove, onAdd }: Props) {
    const isLow = item.minStock !== null && item.quantity <= item.minStock;
    const isEmpty = item.quantity <= 0;

    return (
        <div className={styles.itemRow} data-testid={`item-${item.id}`}>
            <div className={styles.itemInfo}>
                <div className={styles.itemName}>{item.name}</div>
                {item.category && <div className={styles.itemMeta}>{item.category}</div>}
            </div>

            {/* `data-testid` : la spec E2E doit lire CETTE valeur, et non le premier
                nombre du texte du conteneur — qui n'est pas garanti être la quantité. */}
            <div
                className={`${styles.itemQuantity} ${isLow ? styles.low : ''}`}
                data-testid={`qty-${item.id}`}
            >
                {item.quantity}
            </div>

            {/* Retour immédiat là où le doigt se trouve. Sans lui, un clic en haut
                d'une liste de 150 articles ne produisait rien de visible : la
                quantité ne bouge qu'après validation et le panier est en bas. */}
            {pending !== 0 && (
                <div className={styles.pendingBadge} data-testid={`pending-${item.id}`}>
                    {pending > 0 ? `+${pending}` : pending}
                </div>
            )}

            <div className={styles.stepper}>
                <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() => onRemove(item)}
                    disabled={isEmpty}
                    title={isEmpty ? 'Stock à zéro : rien à retirer' : undefined}
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
