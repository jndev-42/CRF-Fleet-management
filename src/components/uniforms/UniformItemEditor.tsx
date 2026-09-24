'use client';

import { useState } from 'react';
import { Archive, Pencil, Plus } from 'lucide-react';
import type { UniformItemView } from '@/lib/uniforms/catalog';
import { sendJson } from './api';
import UniformSizeRow from './UniformSizeRow';
import styles from './uniforms.module.css';

interface Props {
    item: UniformItemView;
    onChanged: () => void;
}

/**
 * Carte d'un article dans l'onglet Gestion : renommer, archiver, ajouter une
 * taille. Chaque taille est éditée par `UniformSizeRow`.
 */
export default function UniformItemEditor({ item, onChanged }: Props) {
    const [renaming, setRenaming] = useState(false);
    const [name, setName] = useState(item.name);
    const [label, setLabel] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const base = `/api/uniforms/items/${encodeURIComponent(item.id)}`;

    async function run(action: () => Promise<string | null>) {
        if (busy) return;
        setBusy(true);
        setError(null);
        const err = await action();
        setBusy(false);
        if (err) setError(err);
        else onChanged();
        return err;
    }

    async function handleRename(e: React.FormEvent) {
        e.preventDefault();
        const err = await run(() => sendJson(base, 'PATCH', { name: name.trim() }));
        if (!err) setRenaming(false);
    }

    async function handleArchive() {
        if (!confirm(`Retirer l'article « ${item.name} » du catalogue ?\n\nL'historique de ses emprunts est conservé.`)) return;
        await run(() => sendJson(base, 'DELETE'));
    }

    async function handleAddSize(e: React.FormEvent) {
        e.preventDefault();
        const err = await run(() => sendJson(`${base}/sizes`, 'POST', { label: label.trim(), quantity: Number(quantity) }));
        if (!err) { setLabel(''); setQuantity('1'); }
    }

    return (
        <div className={styles.itemCard}>
            <div className={styles.toolbar}>
                {renaming ? (
                    <form className={styles.inlineForm} onSubmit={handleRename}>
                        <input className="form-input" aria-label="Nom de l'article" value={name} onChange={e => setName(e.target.value)} maxLength={100} required />
                        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Enregistrer</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setRenaming(false); setName(item.name); }}>Annuler</button>
                    </form>
                ) : (
                    <h3 className={styles.itemName}>{item.name}</h3>
                )}
                {!renaming && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRenaming(true)} aria-label={`Renommer ${item.name}`}>
                            <Pencil size={14} aria-hidden="true" /> Renommer
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={handleArchive} disabled={busy} aria-label={`Retirer ${item.name}`}>
                            <Archive size={14} aria-hidden="true" /> Retirer
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div className={styles.errorBox} role="alert" style={{ margin: '8px 0' }}>
                    <span className={styles.errorText}>{error}</span>
                    <button type="button" className={styles.dismiss} onClick={() => setError(null)} aria-label="Masquer le message d'erreur">✕</button>
                </div>
            )}

            {item.sizes.length === 0 && <div className={styles.pieceMeta}>Aucune taille — ajoutez-en une pour rendre l&apos;article empruntable.</div>}
            {item.sizes.map(size => (
                // Clé = id + quantité serveur : la ligne amorce son champ une
                // seule fois, elle est remontée quand la valeur en base change.
                <UniformSizeRow key={`${size.id}-${size.quantity}`} itemId={item.id} itemName={item.name} size={size} onChanged={onChanged} onError={setError} />
            ))}

            <form className={styles.inlineForm} onSubmit={handleAddSize} style={{ marginTop: 8 }}>
                <input className="form-input" aria-label={`Nouvelle taille pour ${item.name}`} placeholder="Taille (ex. M)" value={label} onChange={e => setLabel(e.target.value)} maxLength={30} required style={{ width: 140 }} />
                <input className={`form-input ${styles.qtyInput}`} type="number" min={0} max={10000} aria-label={`Quantité de la nouvelle taille pour ${item.name}`} value={quantity} onChange={e => setQuantity(e.target.value)} required />
                <button type="submit" className="btn btn-secondary btn-sm" disabled={busy}>
                    <Plus size={14} aria-hidden="true" /> Ajouter la taille
                </button>
            </form>
        </div>
    );
}
