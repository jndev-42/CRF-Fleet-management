'use client';

import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { MAX_ITEM_LABEL, missingItemsLabel, type DossierItem, type FleetDossierDetail } from '@/lib/fleetTracking/dossiers';
import type { TaskAttachment } from '@/lib/fleetTracking/tasks';
import DossierItemRow from './DossierItemRow';
import { DOSSIERS_URL } from './useFleetDossiers';
import { readError } from './useFleetContacts';
import styles from './dossiers.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    dossier: FleetDossierDetail;
    onUpdate: (fn: (d: FleetDossierDetail) => FleetDossierDetail) => void;
    /** Fichier joint au dossier depuis « Marquer reçue ». */
    onAttachmentAdded: (attachment: TaskAttachment) => void;
}

/** Recalcule les compteurs du dossier après un changement de ses pièces. */
function withItems(d: FleetDossierDetail, items: DossierItem[]): FleetDossierDetail {
    return { ...d, items, itemCount: items.length, missingItemCount: items.filter(i => !i.received).length };
}

/** Pièces à récupérer : « N sur M manquantes », ajout d'une pièce, réception et retrait. */
export default function DossierItems({ dossier, onUpdate, onAttachmentAdded }: Props) {
    const [adding, setAdding] = useState(false);
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const base = `${DOSSIERS_URL}/${encodeURIComponent(dossier.id)}/items`;
    const summary = missingItemsLabel(dossier.items);

    const add = async (e: FormEvent) => {
        e.preventDefault();
        if (!label.trim()) return setError('Le libellé est requis');
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: label.trim() }) });
            if (!res.ok) {
                setError(await readError(res, 'Ajout impossible'));
                return;
            }
            const { item } = await res.json() as { item: DossierItem };
            onUpdate(d => withItems(d, [...d.items, item]));
            setLabel('');
            setAdding(false);
        } catch {
            setError('Ajout impossible');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className={styles.card} aria-labelledby="dossier-items-title">
            <div className={styles.cardHeader}>
                <h3 id="dossier-items-title" className={styles.cardTitle}>Pièces à récupérer</h3>
                {summary && <span className={styles.counter} aria-live="polite">{summary}</span>}
                <button type="button" className="btn btn-secondary" onClick={() => setAdding(a => !a)} aria-expanded={adding}>
                    <Plus size={16} aria-hidden="true" /> Pièce
                </button>
            </div>
            {adding && (
                <form className={styles.inlineForm} onSubmit={e => void add(e)} noValidate>
                    <label className={taskStyles.srOnly} htmlFor="dossier-item-label">Libellé de la pièce</label>
                    <input id="dossier-item-label" className="form-input" autoFocus value={label} maxLength={MAX_ITEM_LABEL}
                        placeholder="Référence du sinistre, devis, facture…" onChange={e => setLabel(e.target.value)} />
                    <button type="submit" className="btn btn-primary" disabled={busy}>Ajouter</button>
                </form>
            )}
            {dossier.items.length === 0 && !adding && <p className={taskStyles.dim}>Aucune pièce à récupérer.</p>}
            <ul className={styles.items}>
                {dossier.items.map(item => (
                    <DossierItemRow
                        key={item.id}
                        item={item}
                        url={`${base}/${encodeURIComponent(item.id)}`}
                        attachmentsUrl={`${DOSSIERS_URL}/${encodeURIComponent(dossier.id)}/attachments`}
                        attachments={dossier.attachments}
                        onSaved={next => onUpdate(d => withItems(d, d.items.map(i => (i.id === next.id ? next : i))))}
                        onRemoved={() => onUpdate(d => withItems(d, d.items.filter(i => i.id !== item.id)))}
                        onAttachmentAdded={onAttachmentAdded}
                    />
                ))}
            </ul>
            {error && <p role="alert" className={taskStyles.error}>{error}</p>}
        </section>
    );
}
