'use client';

import { useRef } from 'react';
import styles from '../MissionWizard.module.css';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface Step8PhotosProps {
    photos: File[];
    onPhotosChange: (files: File[]) => void;
    uploadError: string | null;
}

export default function Step8Photos({ photos, onPhotosChange, uploadError }: Step8PhotosProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const selected = Array.from(e.target.files ?? []);
        const combined = [...photos, ...selected];

        if (combined.length > MAX_FILES) {
            onPhotosChange(photos); // keep existing, ignore new batch
            return;
        }

        for (const file of selected) {
            if (file.size > MAX_FILE_SIZE) {
                onPhotosChange(photos);
                return;
            }
        }

        onPhotosChange(combined);
        // Reset input so the same file can be added again if needed
        if (inputRef.current) inputRef.current.value = '';
    }

    function handleRemove(index: number) {
        const updated = photos.filter((_, i) => i !== index);
        onPhotosChange(updated);
    }

    const tooManyFiles = photos.length >= MAX_FILES;

    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Photos de communication</h2>
            <p className={styles.stepSubtitle}>
                Optionnel — Ajoutez des photos du poste, de l&apos;équipe ou du terrain pour la communication.
            </p>

            {uploadError && (
                <div className={styles.errorBox} role="alert">{uploadError}</div>
            )}

            {!tooManyFiles && (
                <div className="form-group">
                    <label className="form-label">
                        Ajouter des photos ({photos.length}/{MAX_FILES})
                    </label>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        capture="environment"
                        onChange={handleFileChange}
                        style={{ display: 'block', marginTop: '0.5rem' }}
                    />
                    <span className={styles.fieldHint}>
                        Maximum {MAX_FILES} fichiers · 10 Mo par photo · Formats : JPEG, PNG, WEBP...
                    </span>
                </div>
            )}

            {tooManyFiles && (
                <p className={styles.fieldHint}>
                    Nombre maximum de photos atteint ({MAX_FILES}).
                </p>
            )}

            {photos.length > 0 && (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
                        gap: '0.75rem',
                        marginTop: '1.25rem',
                    }}
                >
                    {photos.map((file, i) => {
                        const url = URL.createObjectURL(file);
                        return (
                            <div
                                key={i}
                                style={{ position: 'relative', width: 80, height: 80 }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={url}
                                    alt={file.name}
                                    style={{
                                        width: 80,
                                        height: 80,
                                        objectFit: 'cover',
                                        borderRadius: 6,
                                        border: '1px solid var(--border-primary)',
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => handleRemove(i)}
                                    aria-label={`Supprimer ${file.name}`}
                                    style={{
                                        position: 'absolute',
                                        top: -6,
                                        right: -6,
                                        width: 20,
                                        height: 20,
                                        borderRadius: '50%',
                                        background: 'var(--crf-red, #c0122c)',
                                        color: '#fff',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '0.7rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 700,
                                        lineHeight: 1,
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {photos.length === 0 && (
                <p className={styles.noIncidentNote} style={{ marginTop: '1rem' }}>
                    Aucune photo ajoutée pour l&apos;instant.
                </p>
            )}
        </div>
    );
}
