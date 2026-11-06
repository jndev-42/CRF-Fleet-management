'use client';

import { useState } from 'react';
import { Trash2, Undo2 } from 'lucide-react';
import PhotoPicker from '@/components/ui/PhotoPicker';
import { PHOTO_ACCEPT, PHOTO_TOO_LARGE_ERROR } from '@/lib/vehiclePhoto';

/**
 * Changement demandé sur la photo, appliqué par la modale APRÈS la création /
 * modification réussie du véhicule (la photo ne passe jamais dans le payload JSON).
 */
export type PhotoChange =
    | { kind: 'keep' }
    | { kind: 'replace'; file: File }
    | { kind: 'remove' };

interface VehiclePhotoFieldProps {
    /** URL de la photo enregistrée, `null` s'il n'y en a pas. */
    currentSrc: string | null;
    value: PhotoChange;
    onChange: (change: PhotoChange) => void;
    disabled?: boolean;
}

const smallButton = { padding: '4px 12px', fontSize: 13 };

/**
 * Sélecteur de la photo, partagé par les modales de création et de modification.
 * `PhotoPicker` compresse dans le navigateur, pour qu'une photo de téléphone passe
 * sous la limite d'envoi ; le serveur revalide et normalise.
 */
export default function VehiclePhotoField({ currentSrc, value, onChange, disabled }: VehiclePhotoFieldProps) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const showCurrent = value.kind === 'keep' && !!currentSrc;

    return (
        <div className="form-group">
            <div className="form-label">Photo du véhicule (JPEG, PNG ou WebP, 4 Mo max) — Optionnel</div>
            {/* PhotoPicker n'a pas de prop `disabled` : le fieldset désactive ses boutons. */}
            <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {value.kind !== 'replace' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {showCurrent && failedSrc !== currentSrc && (
                            // eslint-disable-next-line @next/next/no-img-element -- image privée servie par l'API
                            <img
                                src={currentSrc}
                                alt="Photo actuelle du véhicule"
                                onError={() => setFailedSrc(currentSrc)}
                                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-primary)' }}
                            />
                        )}
                        <div data-testid="photo-status" style={{ flex: '1 1 160px', fontSize: 14, color: 'var(--text-secondary)' }}>
                            {value.kind === 'remove' && 'La photo actuelle sera retirée.'}
                            {value.kind === 'keep' && !currentSrc && 'Aucune photo.'}
                            {showCurrent && (failedSrc === currentSrc ? 'Photo actuelle illisible.' : 'Photo actuelle.')}
                        </div>
                        {showCurrent && (
                            <button type="button" className="btn btn-secondary" style={smallButton} onClick={() => onChange({ kind: 'remove' })}>
                                <Trash2 size={14} aria-hidden="true" /> Retirer
                            </button>
                        )}
                    </div>
                )}
                {value.kind !== 'keep' && (
                    <div>
                        <button type="button" className="btn btn-secondary" style={smallButton} onClick={() => onChange({ kind: 'keep' })}>
                            <Undo2 size={14} aria-hidden="true" /> Annuler
                        </button>
                    </div>
                )}
                <PhotoPicker
                    file={value.kind === 'replace' ? value.file : null}
                    onFileChange={file => onChange(file ? { kind: 'replace', file } : { kind: 'keep' })}
                    accept={PHOTO_ACCEPT}
                    maxSizeMB={4}
                    maxTotalSizeMB={4}
                />
            </fieldset>
        </div>
    );
}

/**
 * Applique le changement de photo sur un véhicule déjà enregistré. Renvoie le
 * message d'erreur du serveur, ou `null` en cas de succès (ou s'il n'y a rien à faire).
 */
export async function applyPhotoChange(vehicleName: string, change: PhotoChange): Promise<string | null> {
    if (change.kind === 'keep') return null;
    const url = `/api/vehicles/${encodeURIComponent(vehicleName)}/photo`;
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
        if (res.status === 413) return PHOTO_TOO_LARGE_ERROR;
        const data = await res.json().catch(() => null) as { error?: string } | null;
        return data?.error || `Erreur HTTP ${res.status}`;
    } catch {
        return 'Erreur de connexion';
    }
}
