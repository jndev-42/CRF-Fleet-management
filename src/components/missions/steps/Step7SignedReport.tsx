'use client';

import { useRef } from 'react';
import { FileText } from 'lucide-react';
import styles from '../MissionWizard.module.css';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 Mo

export interface Step7SignedReportProps {
    file: File | null;
    onChange: (file: File | null) => void;
}

export default function Step7SignedReport({ file, onChange }: Step7SignedReportProps) {
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const selected = e.target.files?.[0] ?? null;
        if (!selected) return;
        if (selected.size > MAX_FILE_SIZE) {
            alert('Le fichier dépasse la taille maximale de 20 Mo.');
            e.target.value = '';
            return;
        }
        onChange(selected);
        e.target.value = '';
    }

    function handleRemove() {
        onChange(null);
    }

    const isImage = file && file.type.startsWith('image/');

    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Rapport signé</h2>
            <p className={styles.stepSubtitle}>
                Photographiez ou importez le rapport de mission papier signé par l&apos;organisateur.{' '}
                <strong>Obligatoire.</strong>
            </p>

            {!file && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem' }}>
                    {/* Bouton appareil photo — ouvre directement la caméra */}
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => cameraInputRef.current?.click()}
                        style={{ justifyContent: 'center' }}
                    >
                        Photographier avec l&apos;appareil photo
                    </button>
                    <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />

                    {/* Bouton galerie/documents — ouvre le picker système */}
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => galleryInputRef.current?.click()}
                        style={{ justifyContent: 'center' }}
                    >
                        Importer depuis la galerie ou les documents
                    </button>
                    <input
                        ref={galleryInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />

                    <span className={styles.fieldHint}>
                        Formats acceptés : JPEG, PNG, WEBP, PDF · Maximum 20 Mo
                    </span>
                </div>
            )}

            {file && (
                <div style={{ marginTop: '1.25rem' }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            padding: '0.75rem',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 8,
                            background: 'var(--bg-secondary)',
                        }}
                    >
                        {isImage ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={URL.createObjectURL(file)}
                                alt="Aperçu du rapport signé"
                                style={{
                                    width: 80,
                                    height: 80,
                                    objectFit: 'cover',
                                    borderRadius: 6,
                                    flexShrink: 0,
                                    border: '1px solid var(--border-primary)',
                                }}
                            />
                        ) : (
                            <div
                                style={{
                                    width: 80,
                                    height: 80,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'var(--bg-tertiary)',
                                    borderRadius: 6,
                                    flexShrink: 0,
                                }}
                            >
                                <FileText size={36} style={{ color: 'var(--text-secondary)' }} />
                            </div>
                        )}

                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {file.name}
                            </p>
                            <p className={styles.fieldHint} style={{ margin: '0.25rem 0 0' }}>
                                {(file.size / 1024 / 1024).toFixed(2)} Mo
                            </p>
                        </div>

                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleRemove}
                            aria-label="Supprimer le fichier"
                            style={{ flexShrink: 0 }}
                        >
                            Changer
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
