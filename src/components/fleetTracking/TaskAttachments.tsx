'use client';

import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { FileText, ImageIcon, Trash2, Upload } from 'lucide-react';
import { ATTACHMENT_ACCEPT, formatAttachmentSize, validateAttachmentFile } from '@/lib/fleetTracking/attachments';
import { formatFrDate, type TaskAttachment } from '@/lib/fleetTracking/tasks';
import { TASKS_URL } from './useFleetTasks';
import { readError } from './useFleetContacts';
import styles from './tasks.module.css';

interface Props {
    /** Tâche propriétaire (route `/tasks/<id>/attachments`)… */
    taskId?: string;
    /** …ou URL de base des pièces jointes d'un autre propriétaire (dossier). */
    baseUrl?: string;
    attachments: TaskAttachment[];
    /** Mise à jour fonctionnelle : un envoi qui se termine ne repart jamais d'une liste périmée. */
    onChange: Dispatch<SetStateAction<TaskAttachment[]>>;
}

/**
 * Pièces jointes d'une tâche ou d'un dossier enregistré : liste (ouverture dans un nouvel onglet),
 * suppression avec confirmation, dépôt par glisser-déposer ou sélection (PDF ou image,
 * 4 Mo). Chaque action est enregistrée aussitôt, indépendamment du formulaire ;
 * une seule à la fois (un dépôt pendant un envoi est ignoré).
 */
export default function TaskAttachments({ taskId, baseUrl, attachments, onChange }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    // Miroir synchrone de `busy` : deux dépôts dans le même rendu ne lancent pas deux envois.
    const busyRef = useRef(false);
    const setBusyBoth = (on: boolean) => {
        busyRef.current = on;
        setBusy(on);
    };
    const base = baseUrl ?? `${TASKS_URL}/${encodeURIComponent(taskId ?? '')}/attachments`;

    const upload = async (file: File) => {
        if (busyRef.current) return;
        const invalid = validateAttachmentFile(file);
        if (invalid) {
            setError(invalid);
            return;
        }
        setBusyBoth(true);
        setError(null);
        try {
            const body = new FormData();
            body.append('file', file);
            const res = await fetch(base, { method: 'POST', body });
            if (!res.ok) {
                setError(await readError(res, 'Envoi du fichier impossible'));
                return;
            }
            const data = await res.json() as { attachment: TaskAttachment };
            onChange(list => [...list, data.attachment]);
        } catch {
            setError('Envoi du fichier impossible');
        } finally {
            setBusyBoth(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const remove = async (a: TaskAttachment) => {
        if (busyRef.current || !window.confirm(`Supprimer la pièce jointe « ${a.fileName} » ?`)) return;
        setBusyBoth(true);
        setError(null);
        try {
            const res = await fetch(`${base}/${encodeURIComponent(a.id)}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 404) {
                setError(await readError(res, 'Suppression impossible'));
                return;
            }
            onChange(list => list.filter(x => x.id !== a.id));
        } catch {
            setError('Suppression impossible');
        } finally {
            setBusyBoth(false);
        }
    };

    return (
        <div>
            {attachments.length > 0 && (
                <ul className={styles.files}>
                    {attachments.map(a => (
                        <li key={a.id} className={styles.file}>
                            {a.contentType === 'application/pdf'
                                ? <FileText size={20} aria-hidden="true" />
                                : <ImageIcon size={20} aria-hidden="true" />}
                            <div className={styles.fileInfo}>
                                <a href={`${base}/${encodeURIComponent(a.id)}`} target="_blank" rel="noopener noreferrer" className={styles.chipLink}>
                                    {a.fileName}
                                </a>
                                <span className={styles.dropdownMeta}>
                                    {[formatAttachmentSize(a.size), a.uploadedByName, formatFrDate(a.createdAt)].filter(Boolean).join(' · ')}
                                </span>
                            </div>
                            <button type="button" className={`btn btn-secondary ${styles.iconBtn}`} aria-label={`Supprimer ${a.fileName}`} disabled={busy} onClick={() => void remove(a)}>
                                <Trash2 size={16} aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <div
                className={`${styles.drop}${dragOver ? ` ${styles.dropTarget}` : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && !busyRef.current) void upload(file);
                }}
            >
                <Upload size={16} aria-hidden="true" />
                <span>{busy ? 'Envoi…' : 'Glisser un fichier ici ou'}</span>
                <label className={styles.chipLink}>
                    parcourir
                    <input
                        ref={inputRef}
                        type="file"
                        accept={ATTACHMENT_ACCEPT}
                        className={styles.srOnly}
                        disabled={busy}
                        aria-label="Joindre un fichier"
                        onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) void upload(file);
                        }}
                    />
                </label>
                <span className={styles.dropdownMeta}>PDF ou image, 4 Mo maximum</span>
            </div>
            {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>
    );
}
