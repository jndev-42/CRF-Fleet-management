'use client';

import { useState } from 'react';
import type { UniformItemView } from '@/lib/uniforms/catalog';
import { notifyUniformsChanged } from './events';
import styles from './uniforms.module.css';

interface Props {
    items: UniformItemView[];
    /** Route de validation : `/api/uniforms/loans` (appli) ou `/api/qr-uniforms/<token>/loans` (QR). */
    submitUrl: string;
    /** Appelé après un emprunt réussi — typiquement pour recharger le catalogue. */
    onSubmitted: () => void;
}

/**
 * Catalogue empruntable + panier. Partagé par la page appli et la page QR :
 * seule l'URL de validation diffère.
 *
 * Le panier est borné au disponible affiché, mais c'est le serveur qui fait
 * foi : il recontrôle dans la transaction et répond 409 si une autre
 * validation est passée entre-temps. Le message s'affiche inline, jamais via
 * `alert()` (modèle `qr-stock/[token]/CartSummary.tsx`).
 */
export default function UniformCatalog({ items, submitUrl, onSubmitted }: Props) {
    const [cart, setCart] = useState<Record<string, number>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const borrowable = items.filter(item => item.sizes.length > 0);

    // Quantité retenue pour une taille : bornée au disponible COURANT. Après un
    // 409, le catalogue rechargé abaisse le disponible ; sans cette borne, le
    // panier garderait l'excédent et chaque nouvel envoi reprendrait un 409.
    const inCartOf = (size: { id: string; available: number }) => Math.min(cart[size.id] ?? 0, size.available);

    // Libellés du panier recalculés depuis le catalogue courant, plutôt que
    // stockés à part : un rechargement ne peut pas les désynchroniser.
    const cartLines = borrowable.flatMap(item => item.sizes
        .filter(size => inCartOf(size) > 0)
        .map(size => ({ sizeId: size.id, label: `${item.name} ${size.label}`, quantity: inCartOf(size) })));
    const totalPieces = cartLines.reduce((sum, line) => sum + line.quantity, 0);

    function setQuantity(sizeId: string, quantity: number) {
        setSuccess(null);
        setCart(prev => {
            const next = { ...prev };
            if (quantity <= 0) delete next[sizeId];
            else next[sizeId] = quantity;
            return next;
        });
    }

    async function submit() {
        if (submitting || cartLines.length === 0) return;
        setSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch(submitUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lines: cartLines.map(({ sizeId, quantity }) => ({ sizeId, quantity })) }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || 'Erreur lors de l\'emprunt');
                // Le disponible a pu changer : on recharge pour afficher l'état réel.
                if (res.status === 409) onSubmitted();
                return;
            }
            setCart({});
            setSuccess(`${totalPieces} pièce${totalPieces > 1 ? 's' : ''} empruntée${totalPieces > 1 ? 's' : ''}. Pensez à les rendre depuis « Mes pièces empruntées », en haut de cette page.`);
            notifyUniformsChanged();
            onSubmitted();
        } catch {
            setError('Erreur de connexion — aucun emprunt enregistré');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className={styles.section}>
            {error && (
                <div className={styles.errorBox} role="alert">
                    <span className={styles.errorText}>{error}</span>
                    <button type="button" className={styles.dismiss} onClick={() => setError(null)} aria-label="Masquer le message d'erreur">✕</button>
                </div>
            )}
            {success && <div className={styles.successBox} role="status">{success}</div>}

            {borrowable.length === 0 ? (
                <div className={styles.emptyState}>Aucun article d&apos;uniforme disponible pour cette unité locale.</div>
            ) : borrowable.map(item => (
                <div key={item.id} className={styles.itemCard}>
                    <h3 className={styles.itemName}>{item.name}</h3>
                    {item.sizes.map(size => {
                        const inCart = inCartOf(size);
                        return (
                            <div key={size.id} className={styles.sizeRow}>
                                <span className={styles.sizeLabel}>{size.label}</span>
                                <span className={styles.sizeAvailable}>
                                    {size.available} disponible{size.available > 1 ? 's' : ''}
                                </span>
                                <div className={styles.stepper}>
                                    <button
                                        type="button"
                                        className={styles.stepperBtn}
                                        onClick={() => setQuantity(size.id, inCart - 1)}
                                        disabled={inCart === 0}
                                        aria-label={`Retirer un ${item.name} ${size.label} du panier`}
                                    >
                                        −
                                    </button>
                                    <span className={styles.stepperValue} aria-label={`${item.name} ${size.label} dans le panier`}>{inCart}</span>
                                    <button
                                        type="button"
                                        className={styles.stepperBtn}
                                        onClick={() => setQuantity(size.id, inCart + 1)}
                                        disabled={inCart >= size.available}
                                        aria-label={`Ajouter un ${item.name} ${size.label} au panier`}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}

            {cartLines.length > 0 && (
                <div className={styles.cart}>
                    <h2 className={styles.cartTitle}>Panier ({totalPieces} pièce{totalPieces > 1 ? 's' : ''})</h2>
                    <ul className={styles.cartList}>
                        {cartLines.map(line => (
                            <li key={line.sizeId} className={styles.cartRow}>
                                <span className={styles.cartLabel}>{line.label} × {line.quantity}</span>
                                <button
                                    type="button"
                                    className={styles.dismiss}
                                    onClick={() => setQuantity(line.sizeId, 0)}
                                    aria-label={`Retirer ${line.label} du panier`}
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ul>
                    <button
                        type="button"
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        onClick={submit}
                        disabled={submitting}
                    >
                        {submitting ? 'Enregistrement…' : 'Valider l\'emprunt'}
                    </button>
                </div>
            )}
        </div>
    );
}
