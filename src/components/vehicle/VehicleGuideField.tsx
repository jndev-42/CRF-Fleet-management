'use client';

import React, { useId, useRef, useState } from 'react';
import { FileText, Upload, Trash2, Undo2 } from 'lucide-react';
import { GUIDE_TOO_LARGE_ERROR, formatGuideSize, validateGuideFile } from '@/lib/vehicleGuide';

/**
 * Changement demandé sur le guide de vérification, appliqué par la modale
 * APRÈS la création / modification réussie du véhicule (le PDF ne passe jamais
 * dans le payload JSON du véhicule).
 */
export type GuideChange =
    | { kind: 'keep' }
    | { kind: 'replace'; file: File }
    | { kind: 'remove' };

interface VehicleGuideFieldProps {
    /** Nom du guide actuellement enregistré, `null` s'il n'y en a pas. */
    currentFileName: string | null;
    value: GuideChange;
    onChange: (change: GuideChange) => void;
    disabled?: boolean;
}

/**
 * Sélecteur du guide de vérification PDF, partagé par les modales de création
 * et de modification d'un véhicule. Valide le fichier côté navigateur (type et
 * taille) pour un retour immédiat ; le serveur revalide, octets compris.
 */
export default function VehicleGuideField({ currentFileName, value, onChange, disabled }: VehicleGuideFieldProps) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        // Réinitialisé pour qu'une resélection du même fichier redéclenche `change`.
        e.target.value = '';
        if (!file) return;
        const validationError = validateGuideFile(file);
        if (validationError) {
            setError(validationError);
            return;
        }
        setError(null);
        onChange({ kind: 'replace', file });
    }

    function reset() {
        setError(null);
        onChange({ kind: 'keep' });
    }

    let status: React.ReactNode;
    if (value.kind === 'replace') {
        const size = formatGuideSize(value.file.size);
        status = (
            <>
                <strong>{value.file.name}</strong>
                {size && <span style={{ color: 'var(--text-secondary)' }}> · {size}</span>}
                <span style={{ color: 'var(--text-secondary)' }}> — sera enregistré</span>
            </>
        );
    } else if (value.kind === 'remove') {
        status = <span style={{ color: 'var(--text-secondary)' }}>Le guide <strong>{currentFileName}</strong> sera retiré.</span>;
    } else if (currentFileName) {
        status = <strong>{currentFileName}</strong>;
    } else {
        status = <span style={{ color: 'var(--text-secondary)' }}>Aucun guide joint.</span>;
    }

    const hasGuideAfterChange = value.kind === 'replace' || (value.kind === 'keep' && !!currentFileName);

    return (
        <div className="form-group">
            <label className="form-label" htmlFor={inputId}>Guide de vérification (PDF, 4 Mo max) — Optionnel</label>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                padding: '10px 14px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-primary)',
            }}>
                <FileText size={18} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
                <div data-testid="guide-status" style={{ flex: '1 1 160px', fontSize: 14, minWidth: 0, overflowWrap: 'anywhere' }}>
                    {status}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '4px 12px', fontSize: 13 }}
                        onClick={() => inputRef.current?.click()}
                        disabled={disabled}
                    >
                        <Upload size={14} aria-hidden="true" /> {hasGuideAfterChange ? 'Remplacer' : 'Joindre un PDF'}
                    </button>
                    {value.kind === 'keep' && currentFileName && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 12px', fontSize: 13 }}
                            onClick={() => { setError(null); onChange({ kind: 'remove' }); }}
                            disabled={disabled}
                        >
                            <Trash2 size={14} aria-hidden="true" /> Retirer
                        </button>
                    )}
                    {value.kind !== 'keep' && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 12px', fontSize: 13 }}
                            onClick={reset}
                            disabled={disabled}
                        >
                            <Undo2 size={14} aria-hidden="true" /> Annuler
                        </button>
                    )}
                </div>
                <input
                    ref={inputRef}
                    id={inputId}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleFile}
                    disabled={disabled}
                    style={{ display: 'none' }}
                />
            </div>
            {error && (
                <div role="alert" style={{ marginTop: 6, fontSize: 13, color: 'var(--error-text)' }}>
                    {error}
                </div>
            )}
        </div>
    );
}

/**
 * Applique le changement de guide sur un véhicule déjà enregistré. Renvoie le
 * message d'erreur du serveur, ou `null` en cas de succès (ou s'il n'y a rien à faire).
 */
export async function applyGuideChange(vehicleName: string, change: GuideChange): Promise<string | null> {
    if (change.kind === 'keep') return null;
    const url = `/api/vehicles/${encodeURIComponent(vehicleName)}/guide`;
    try {
        let res: Response;
        if (change.kind === 'replace') {
            const formData = new FormData();
            formData.append('file', change.file);
            res = await fetch(url, { method: 'POST', body: formData });
        } else {
            res = await fetch(url, { method: 'DELETE' });
        }
        if (res.ok) return null;
        // Un 413 peut venir de la plateforme (corps refusé avant la route), sans JSON.
        if (res.status === 413) return GUIDE_TOO_LARGE_ERROR;
        const data = await res.json().catch(() => null) as { error?: string } | null;
        return data?.error || `Erreur HTTP ${res.status}`;
    } catch {
        return 'Erreur de connexion';
    }
}
