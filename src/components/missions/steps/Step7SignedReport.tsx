'use client';

import { FileText } from 'lucide-react';
import styles from '../MissionWizard.module.css';
import PhotoPicker from '@/components/ui/PhotoPicker';

export interface Step7SignedReportProps {
    file: File | null;
    onChange: (file: File | null) => void;
}

export default function Step7SignedReport({ file, onChange }: Step7SignedReportProps) {
    const isImage = file && file.type.startsWith('image/');

    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Rapport signé</h2>
            <p className={styles.stepSubtitle}>
                Photographiez ou importez le rapport de mission papier signé par l&apos;organisateur.{' '}
                <strong>Obligatoire.</strong>
            </p>

            {!file && (
                <PhotoPicker
                    file={file}
                    onFileChange={onChange}
                    maxSizeMB={15}
                    maxTotalSizeMB={150}
                    accept="image/*,application/pdf"
                    hint="Formats acceptés : JPEG, PNG, WEBP, PDF · Maximum 15 Mo par fichier"
                />
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
                            onClick={() => onChange(null)}
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
