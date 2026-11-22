'use client';

import React from 'react';
import styles from './PhotosRequiredModal.module.css';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface PhotosRequiredModalProps {
  /** Retour à la prise : le sélecteur de photos est mis en avant. */
  onTakePhotos: () => void;
  /** Dérogation : la prise continue sans photo (tracée sur la sortie). */
  onContinue: () => void;
}

/** Avertit qu'aucune photo n'a été jointe alors que l'UL les exige ; une dérogation reste possible. */
export default function PhotosRequiredModal({ onTakePhotos, onContinue }: PhotosRequiredModalProps) {
  useEscapeKey(onTakePhotos);

  return (
    <div className={`modal-overlay ${styles.overlay}`} onClick={onTakePhotos}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-photos-required-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="modal-photos-required-title" className="modal-title">📸 Photos obligatoires</h2>
        </div>
        <div className="modal-body">
          <p className={styles.text}>
            Votre unité locale demande au minimum 4 photos avant le départ : avant, arrière,
            côté gauche et côté droit. Aucune photo n&apos;a été ajoutée.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onContinue}>
            Continuer sans photo
          </button>
          <button type="button" className="btn btn-primary" onClick={onTakePhotos}>
            Prendre des photos
          </button>
        </div>
      </div>
    </div>
  );
}
