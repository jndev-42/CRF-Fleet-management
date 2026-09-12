'use client';

import { useState } from 'react';
import { MAX_MOVEMENTS, type PendingMovement } from './types';
import styles from './page.module.css';

interface Props {
    cart: PendingMovement[];
    token: string;
    onCancelOne: (key: string) => void;
    onSuccess: () => void;
    onError: (message: string) => void;
}

/** Libellé d'une ligne du panier : « Compresses — lot du 01/01/2030 ». */
function describe(movement: PendingMovement): string {
    if (movement.change < 0) return movement.itemName;
    if (movement.expiryDate === null) return `${movement.itemName} — sans date`;
    const d = new Date(movement.expiryDate);
    const label = Number.isNaN(d.getTime()) ? movement.expiryDate : d.toLocaleDateString('fr-FR');
    return `${movement.itemName} — lot du ${label}`;
}

export default function CartSummary({
    cart, token, onCancelOne, onSuccess, onError,
}: Props) {
    // L'état vit ici plutôt que dans la page : c'est ce composant qui émet la
    // requête, et un `submitting` piloté de l'extérieur serait faux tant que le
    // parent ne saurait pas que l'envoi a commencé — le double-tap passerait.
    const [submitting, setSubmitting] = useState(false);
    const tooMany = cart.length > MAX_MOVEMENTS;

    async function submit() {
        if (submitting) return;
        setSubmitting(true);
        // ⚠️ PROJECTION OBLIGATOIRE — ne pas poster `cart` tel quel.
        //
        // Le schéma Zod de la route est `.strict()` : il REJETTE les clés
        // inconnues au lieu de les dépouiller. `key` et `itemName` sont des
        // champs purement client, et les laisser passer renverrait 400 à CHAQUE
        // validation. Aucun test unitaire ne rattraperait l'oubli — le test RTL
        // mocke `fetch` (il n'exerce pas Zod) et les tests d'intégration
        // construisent leur propre corps, conforme par construction.
        const payload = {
            movements: cart.map(({ itemId, change, expiryDate, note }) => ({
                itemId,
                change,
                expiryDate,
                note: note ?? null,
            })),
        };

        try {
            const res = await fetch(`/api/qr-stock/${token}/adjust`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                onError(data.error || 'Erreur lors de l\'enregistrement');
                return;
            }
            onSuccess();
        } catch {
            onError('Erreur de connexion — aucun mouvement enregistré');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className={styles.cart}>
            <h2 className={styles.cartTitle}>
                Mouvements en attente ({cart.length})
            </h2>

            <ul className={styles.cartList}>
                {cart.map(movement => (
                    <li key={movement.key} className={styles.cartRow}>
                        <span className={styles.cartLabel}>{describe(movement)}</span>
                        <span className={`${styles.cartChange} ${movement.change > 0 ? styles.positive : styles.negative}`}>
                            {movement.change > 0 ? `+${movement.change}` : movement.change}
                        </span>
                        <button
                            type="button"
                            className={styles.cartRemove}
                            onClick={() => onCancelOne(movement.key)}
                            aria-label={`Annuler le mouvement sur ${movement.itemName}`}
                        >
                            ✕
                        </button>
                    </li>
                ))}
            </ul>

            {tooMany && (
                <p className={styles.cartWarning}>
                    Maximum {MAX_MOVEMENTS} mouvements par validation. Validez une première fois,
                    puis reprenez le reste.
                </p>
            )}

            <button
                type="button"
                className={`btn btn-primary ${styles.submitBtn}`}
                onClick={submit}
                disabled={submitting || tooMany || cart.length === 0}
            >
                {submitting ? 'Enregistrement…' : 'Valider'}
            </button>
        </div>
    );
}
