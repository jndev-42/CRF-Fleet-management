'use client';

import { useState } from 'react';
import { Check, Paperclip, Trash2, Undo2 } from 'lucide-react';
import { ATTACHMENT_ACCEPT, validateAttachmentFile } from '@/lib/fleetTracking/attachments';
import { MAX_ITEM_VALUE, type DossierItem } from '@/lib/fleetTracking/dossiers';
import { formatFrDate, type TaskAttachment } from '@/lib/fleetTracking/tasks';
import { readError } from './useFleetContacts';
import styles from './dossiers.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    item: DossierItem;
    /** URL de la pièce (`…/items/<itemId>`). */
    url: string;
    /** URL des pièces jointes du dossier. */
    attachmentsUrl: string;
    attachments: TaskAttachment[];
    onSaved: (item: DossierItem) => void;
    onRemoved: () => void;
    onAttachmentAdded: (attachment: TaskAttachment) => void;
}

/**
 * Une pièce à récupérer. « Marquer reçue » ouvre une saisie facultative d'une valeur
 * (numéro de sinistre…) ou d'un fichier (pièce jointe du dossier, existante ou
 * déposée ici) ; « Annuler la réception » efface valeur, fichier, date et auteur.
 */
export default function DossierItemRow({ item, url, attachmentsUrl, attachments, onSaved, onRemoved, onAttachmentAdded }: Props) {
    const [receiving, setReceiving] = useState(false);
    const [value, setValue] = useState('');
    const [attachmentId, setAttachmentId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Fichier choisi puis retiré du dossier entre-temps : on n'envoie pas un identifiant périmé.
    const selectedAttachmentId = attachments.some(a => a.id === attachmentId) ? attachmentId : '';
    const cancelReceive = () => {
        setReceiving(false);
        setValue('');
        setAttachmentId('');
        setError(null);
    };

    const send = async (method: 'PATCH' | 'DELETE', body?: unknown) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(url, {
                method,
                headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
                setError(await readError(res, 'Enregistrement impossible'));
                return;
            }
            if (method === 'DELETE') onRemoved();
            else {
                onSaved((await res.json() as { item: DossierItem }).item);
                cancelReceive();
            }
        } catch {
            setError('Enregistrement impossible');
        } finally {
            setBusy(false);
        }
    };

    const uploadFile = async (file: File) => {
        const invalid = validateAttachmentFile(file);
        if (invalid) return setError(invalid);
        setBusy(true);
        setError(null);
        try {
            const body = new FormData();
            body.append('file', file);
            const res = await fetch(attachmentsUrl, { method: 'POST', body });
            if (!res.ok) {
                setError(await readError(res, 'Envoi du fichier impossible'));
                return;
            }
            const { attachment } = await res.json() as { attachment: TaskAttachment };
            onAttachmentAdded(attachment);
            setAttachmentId(attachment.id);
        } catch {
            setError('Envoi du fichier impossible');
        } finally {
            setBusy(false);
        }
    };

    const receivedMeta = [
        item.receivedValue,
        item.receivedAt ? `reçue le ${formatFrDate(item.receivedAt)}` : null,
        item.receivedByName ? `par ${item.receivedByName}` : null,
    ].filter(Boolean).join(' · ');

    return (
        <li className={`${styles.item}${item.received ? ` ${styles.itemReceived}` : ''}`}>
            <span className={styles.check} aria-hidden="true">{item.received ? <Check size={14} /> : null}</span>
            <div className={styles.itemMain}>
                <div className={styles.itemLabel}>
                    {item.label}
                    <span className={taskStyles.srOnly}>{item.received ? ' (reçue)' : ' (manquante)'}</span>
                </div>
                {item.received && receivedMeta && <div className={styles.rowMeta}>{receivedMeta}</div>}
                {item.received && item.attachmentId && (
                    <a className={taskStyles.chipLink} href={`${attachmentsUrl}/${encodeURIComponent(item.attachmentId)}`} target="_blank" rel="noopener noreferrer">
                        <Paperclip size={12} aria-hidden="true" /> {item.attachmentName}
                    </a>
                )}
                {receiving && (
                    <div className={styles.receiveForm}>
                        <label className="form-label" htmlFor={`item-value-${item.id}`}>Valeur reçue (facultatif)</label>
                        <input id={`item-value-${item.id}`} className="form-input" value={value} maxLength={MAX_ITEM_VALUE}
                            placeholder="Ex. numéro de sinistre" onChange={e => setValue(e.target.value)} />
                        <label className="form-label" htmlFor={`item-file-${item.id}`}>Fichier reçu (facultatif)</label>
                        <select id={`item-file-${item.id}`} className="form-select" value={selectedAttachmentId} onChange={e => setAttachmentId(e.target.value)}>
                            <option value="">Aucun fichier</option>
                            {attachments.map(a => <option key={a.id} value={a.id}>{a.fileName}</option>)}
                        </select>
                        <label className={taskStyles.chipLink}>
                            Joindre un nouveau fichier
                            <input type="file" accept={ATTACHMENT_ACCEPT} className={taskStyles.srOnly} disabled={busy}
                                onChange={e => {
                                    const f = e.target.files?.[0];
                                    // Vidé aussitôt : re-choisir le même fichier après un échec relance l'envoi.
                                    e.target.value = '';
                                    if (f) void uploadFile(f);
                                }} />
                        </label>
                        <div className={styles.actions}>
                            <button type="button" className="btn btn-secondary" disabled={busy} onClick={cancelReceive}>Annuler</button>
                            <button type="button" className="btn btn-primary" disabled={busy}
                                onClick={() => void send('PATCH', { received: true, receivedValue: value.trim() || null, attachmentId: selectedAttachmentId || null })}>
                                Valider la réception
                            </button>
                        </div>
                    </div>
                )}
                {error && <p role="alert" className={taskStyles.error}>{error}</p>}
            </div>
            <div className={styles.itemActions}>
                {!item.received && !receiving && (
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setReceiving(true)} aria-label={`Marquer reçue : ${item.label}`}>
                        Marquer reçue
                    </button>
                )}
                {item.received && (
                    <button type="button" className={`btn btn-secondary ${taskStyles.iconBtn}`} disabled={busy}
                        aria-label={`Annuler la réception : ${item.label}`} onClick={() => void send('PATCH', { received: false })}>
                        <Undo2 size={16} aria-hidden="true" />
                    </button>
                )}
                <button type="button" className={`btn btn-secondary ${taskStyles.iconBtn}`} disabled={busy} aria-label={`Retirer la pièce ${item.label}`}
                    onClick={() => { if (window.confirm(`Retirer la pièce « ${item.label} » ?`)) void send('DELETE'); }}>
                    <Trash2 size={16} aria-hidden="true" />
                </button>
            </div>
        </li>
    );
}
