'use client';

import styles from '../MissionWizard.module.css';
import PhotoPicker from '@/components/ui/PhotoPicker';

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
                    label={`Ajouter des photos (${photos.length})`}
                    hint="10 Mo max par photo · 150 Mo max au total"
                    photos={photos}
                    onPhotosChange={onPhotosChange}
                    maxSizeMB={10}
                    maxTotalSizeMB={150}
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
