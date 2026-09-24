'use client';

import { useState } from 'react';
import type { UniformSizeView } from '@/lib/uniforms/catalog';
import { sendJson } from './api';
import styles from './uniforms.module.css';

interface Props {
    itemId: string;
    itemName: string;
    size: UniformSizeView;
    onChanged: () => void;
    onError: (message: string) => void;
}

/** Ligne d'une taille dans l'onglet Gestion : quantité possédée + retrait. */
export default function UniformSizeRow({ itemId, itemName, size, onChanged, onError }: Props) {
    const [quantity, setQuantity] = useState(String(size.quantity));
    const [busy, setBusy] = useState(false);

    const url = `/api/uniforms/items/${encodeURIComponent(itemId)}/sizes/${encodeURIComponent(size.id)}`;
    const dirty = quantity !== String(size.quantity);

    async function run(method: 'PATCH' | 'DELETE', body?: unknown) {
        if (busy) return;
        setBusy(true);
        const err = await sendJson(url, method, body);
        setBusy(false);
        if (err) onError(err);
        else onChanged();
    }

    function handleArchive() {
        if (!confirm(`Retirer la taille « ${size.label} » de « ${itemName} » ?\n\nL'historique de ses emprunts est conservé.`)) return;
        run('DELETE');
    }

    return (
        <div className={styles.sizeRow}>
            <span className={styles.sizeLabel}>{size.label}</span>
            <span className={styles.sizeAvailable}>{size.available} disponible{size.available > 1 ? 's' : ''}</span>
            <form
                className={styles.inlineForm}
                onSubmit={e => { e.preventDefault(); run('PATCH', { quantity: Number(quantity) }); }}
            >
                <input
                    className={`form-input ${styles.qtyInput}`}
                    type="number"
                    min={0}
                    max={10000}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    aria-label={`Quantité possédée ${itemName} ${size.label}`}
                    required
                />
                {dirty && <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Enregistrer</button>}
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleArchive} disabled={busy} aria-label={`Retirer la taille ${size.label} de ${itemName}`}>
                    Retirer
                </button>
            </form>
        </div>
    );
}
