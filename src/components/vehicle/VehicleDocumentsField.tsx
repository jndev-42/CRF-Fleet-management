'use client';

import React, { useId, useRef, useState } from 'react';
import { FileText, Upload, Trash2, Undo2, X } from 'lucide-react';
import { GUIDE_TOO_LARGE_ERROR, formatGuideSize, validateGuideFile } from '@/lib/vehicleGuide';
import type { VehicleDocumentMeta } from '@/lib/vehicleDocuments/types';

/**
 * Changements demandés sur les documents d'un véhicule, appliqués par la modale
 * APRÈS la création / modification réussie du véhicule (les PDF ne passent jamais
 * dans le payload JSON du véhicule).
 */
export interface DocumentChanges {
    /** Fichiers à ajouter — un appel d'upload par fichier. */
    add: File[];
    /** Documents enregistrés à retirer — le nom sert à nommer le document en cas d'échec. */
    remove: DocumentToRemove[];
}

export interface DocumentToRemove {
    id: string;
    fileName: string;
}

export const NO_DOCUMENT_CHANGES: DocumentChanges = { add: [], remove: [] };

interface VehicleDocumentsFieldProps {
    /** Documents actuellement enregistrés (vide à la création). */
    documents: VehicleDocumentMeta[];
    value: DocumentChanges;
    onChange: (changes: DocumentChanges) => void;
    disabled?: boolean;
}

const buttonStyle = { padding: '4px 12px', fontSize: 13 } as const;
const secondary = { color: 'var(--text-secondary)' } as const;

/**
 * Sélecteur des documents liés au véhicule (PDF, 4 Mo max chacun), partagé par les
 * modales de création et de modification. Valide chaque fichier côté navigateur
 * (type et taille) pour un retour immédiat ; le serveur revalide, octets compris.
 * Un fichier refusé n'empêche pas l'ajout des autres.
 */
export default function VehicleDocumentsField({ documents, value, onChange, disabled }: VehicleDocumentsFieldProps) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [errors, setErrors] = useState<string[]>([]);

    function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        // Réinitialisé pour qu'une resélection du même fichier redéclenche `change`.
        e.target.value = '';
        if (files.length === 0) return;

        const accepted: File[] = [];
        const rejected: string[] = [];
        for (const file of files) {
            const validationError = validateGuideFile(file);
            if (validationError) rejected.push(`${file.name} : ${validationError}`);
            else accepted.push(file);
        }
        setErrors(rejected);
        if (accepted.length > 0) onChange({ ...value, add: [...value.add, ...accepted] });
    }

    function toggleRemove(doc: VehicleDocumentMeta) {
        setErrors([]);
        const remove = value.remove.some(r => r.id === doc.id)
            ? value.remove.filter(r => r.id !== doc.id)
            : [...value.remove, { id: doc.id, fileName: doc.fileName }];
        onChange({ ...value, remove });
    }

    function cancelAdd(file: File) {
        setErrors([]);
        onChange({ ...value, add: value.add.filter(f => f !== file) });
    }

    return (
        <div className="form-group">
            <label className="form-label" htmlFor={inputId}>Documents liés au véhicule (PDF, 4 Mo max chacun) — Optionnel</label>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '10px 14px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-primary)',
            }}>
                <ul data-testid="documents-status" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {documents.length === 0 && value.add.length === 0 && (
                        <li style={{ fontSize: 14, ...secondary }}>Aucun document joint.</li>
                    )}
                    {documents.map(doc => {
                        const removing = value.remove.some(r => r.id === doc.id);
                        const size = formatGuideSize(doc.size);
                        return (
                            <li key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <FileText size={18} aria-hidden="true" style={{ flexShrink: 0, ...secondary }} />
                                <span style={{ flex: '1 1 160px', fontSize: 14, minWidth: 0, overflowWrap: 'anywhere', ...(removing ? { textDecoration: 'line-through', ...secondary } : {}) }}>
                                    <strong>{doc.fileName}</strong>
                                    {size && <span style={secondary}> · {size}</span>}
                                    {removing && <span style={secondary}> — sera retiré</span>}
                                </span>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={buttonStyle}
                                    onClick={() => toggleRemove(doc)}
                                    disabled={disabled}
                                    aria-label={`${removing ? 'Annuler le retrait de' : 'Retirer'} ${doc.fileName}`}
                                >
                                    {removing ? <><Undo2 size={14} aria-hidden="true" /> Annuler</> : <><Trash2 size={14} aria-hidden="true" /> Retirer</>}
                                </button>
                            </li>
                        );
                    })}
                    {value.add.map((file, index) => {
                        const size = formatGuideSize(file.size);
                        return (
                            <li key={`${file.name}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <FileText size={18} aria-hidden="true" style={{ flexShrink: 0, ...secondary }} />
                                <span style={{ flex: '1 1 160px', fontSize: 14, minWidth: 0, overflowWrap: 'anywhere' }}>
                                    <strong>{file.name}</strong>
                                    {size && <span style={secondary}> · {size}</span>}
                                    <span style={secondary}> — sera enregistré</span>
                                </span>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={buttonStyle}
                                    onClick={() => cancelAdd(file)}
                                    disabled={disabled}
                                    aria-label={`Ne pas ajouter ${file.name}`}
                                >
                                    <X size={14} aria-hidden="true" /> Annuler
                                </button>
                            </li>
                        );
                    })}
                </ul>
                <div>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        style={buttonStyle}
                        onClick={() => inputRef.current?.click()}
                        disabled={disabled}
                    >
                        <Upload size={14} aria-hidden="true" /> Joindre des PDF
                    </button>
                </div>
                <input
                    ref={inputRef}
                    id={inputId}
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    onChange={handleFiles}
                    disabled={disabled}
                    style={{ display: 'none' }}
                />
            </div>
            {errors.length > 0 && (
                <div role="alert" style={{ marginTop: 6, fontSize: 13, color: 'var(--error-text)' }}>
                    {errors.map(message => <div key={message}>{message}</div>)}
                </div>
            )}
        </div>
    );
}

/**
 * Applique les changements sur un véhicule déjà enregistré : ajouts PUIS retraits,
 * un appel par fichier (chaque requête reste sous la limite de corps de la plateforme).
 * Les ajouts passent en premier : un remplacement (ajout de la nouvelle version,
 * retrait de l'ancienne) dont l'upload échoue ne fait ainsi perdre aucune des deux.
 * Un échec n'interrompt pas les suivants. Renvoie un message par échec, nommant le
 * fichier concerné, réunis en un texte — ou `null` si tout a réussi (ou rien à faire).
 */
export async function applyDocumentChanges(vehicleName: string, changes: DocumentChanges): Promise<string | null> {
    const base = `/api/vehicles/${encodeURIComponent(vehicleName)}/documents`;
    const failures: string[] = [];

    async function failureOf(res: Response): Promise<string> {
        // Un 413 peut venir de la plateforme (corps refusé avant la route), sans JSON.
        if (res.status === 413) return GUIDE_TOO_LARGE_ERROR;
        const data = await res.json().catch(() => null) as { error?: string } | null;
        return data?.error || `Erreur HTTP ${res.status}`;
    }

    for (const file of changes.add) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch(base, { method: 'POST', body: formData });
            if (!res.ok) failures.push(`${file.name} : ${await failureOf(res)}`);
        } catch {
            failures.push(`${file.name} : erreur de connexion`);
        }
    }

    for (const doc of changes.remove) {
        try {
            const res = await fetch(`${base}/${encodeURIComponent(doc.id)}`, { method: 'DELETE' });
            if (!res.ok) failures.push(`${doc.fileName} : Retrait impossible : ${await failureOf(res)}`);
        } catch {
            failures.push(`${doc.fileName} : Retrait impossible : erreur de connexion`);
        }
    }

    return failures.length > 0 ? failures.join('\n') : null;
}
