'use client';

import { useState } from 'react';
import { Plus, QrCode } from 'lucide-react';
import type { UniformItemView } from '@/lib/uniforms/catalog';
import { sendJson } from './api';
import UniformItemEditor from './UniformItemEditor';
import UniformQRCodeModal from './UniformQRCodeModal';
import styles from './uniforms.module.css';

interface Props {
    items: UniformItemView[];
    ulId: string;
    ulName: string;
    canRegenerateQr: boolean;
    onChanged: () => void;
}

/** Onglet « Gestion » : catalogue de l'UL active et QR Code « Uniformes ». */
export default function UniformManagement({ items, ulId, ulName, canRegenerateQr, onChanged }: Props) {
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showQr, setShowQr] = useState(false);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        const err = await sendJson('/api/uniforms/items', 'POST', { name: name.trim() });
        setBusy(false);
        if (err) { setError(err); return; }
        setName('');
        onChanged();
    }

    return (
        <div className={styles.section}>
            <div className={styles.toolbar}>
                <form className={styles.inlineForm} onSubmit={handleCreate}>
                    <input
                        className="form-input"
                        aria-label="Nom du nouvel article"
                        placeholder="Nouvel article (ex. Polo)"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        maxLength={100}
                        required
                    />
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                        <Plus size={16} aria-hidden="true" /> Créer l&apos;article
                    </button>
                </form>
                <button type="button" className="btn btn-secondary" onClick={() => setShowQr(true)}>
                    <QrCode size={16} aria-hidden="true" /> QR Code Uniformes
                </button>
            </div>

            {error && (
                <div className={styles.errorBox} role="alert">
                    <span className={styles.errorText}>{error}</span>
                    <button type="button" className={styles.dismiss} onClick={() => setError(null)} aria-label="Masquer le message d'erreur">✕</button>
                </div>
            )}

            {items.length === 0 ? (
                <div className={styles.emptyState}>Aucun article. Créez-en un pour commencer.</div>
            ) : items.map(item => (
                // Clé = id + nom serveur : l'éditeur amorce son champ de
                // renommage une seule fois, il est remonté si le nom change.
                <UniformItemEditor key={`${item.id}-${item.name}`} item={item} onChanged={onChanged} />
            ))}

            {showQr && (
                <UniformQRCodeModal
                    ulId={ulId}
                    ulName={`Uniformes — UL ${ulName}`}
                    canRegenerate={canRegenerateQr}
                    onClose={() => setShowQr(false)}
                />
            )}
        </div>
    );
}
