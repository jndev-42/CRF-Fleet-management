'use client';

import styles from '../MissionWizard.module.css';
import PhotoPicker from '@/components/ui/PhotoPicker';

const MAX_FILES = 10;

export interface Step8PhotosProps {
    photos: File[];
    onPhotosChange: (files: File[]) => void;
    uploadError: string | null;
}

export default function Step8Photos({ photos, onPhotosChange, uploadError }: Step8PhotosProps) {
    return (
        <div className={styles.stepContent}>
            <h2 className={styles.stepTitle}>Photos de communication</h2>
            <p className={styles.stepSubtitle}>
                Optionnel — Ajoutez des photos du poste, de l&apos;équipe ou du terrain pour la communication.
            </p>

            {uploadError && (
                <div className={styles.errorBox} role="alert">{uploadError}</div>
            )}

            <div className="form-group" style={{ marginTop: '1.25rem' }}>
                <PhotoPicker
                    label={`Ajouter des photos (${photos.length}/${MAX_FILES})`}
                    hint={`Maximum ${MAX_FILES} fichiers · 10 Mo par photo · Formats : JPEG, PNG, WEBP...`}
                    photos={photos}
                    onPhotosChange={onPhotosChange}
                    maxFiles={MAX_FILES}
                    maxSizeMB={10}
                />
            </div>

            {photos.length === 0 && (
                <p className={styles.noIncidentNote} style={{ marginTop: '1rem' }}>
                    Aucune photo ajoutée pour l&apos;instant.
                </p>
            )}
        </div>
    );
}
