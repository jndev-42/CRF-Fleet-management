'use client';

import { useState } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import { notifyUniformsChanged } from './events';
import styles from './uniforms.module.css';

const MAX_COMMENT = 1000;

interface Props {
    /** Ce qui est rendu : « Polo M » ou « 3 pièces de l'emprunt du … ». */
    subject: string;
    /** `/api/uniforms/loans/<id>/return` ou `/api/uniforms/loan-batches/<id>/return`. */
    url: string;
    onClose: () => void;
    onReturned: () => void;
}

/**
 * Rendu d'une pièce ou d'un emprunt entier : commentaire libre + état
 * propre/sale. L'état n'a PAS de valeur par défaut — le bouton reste inactif
 * tant qu'il n'est pas choisi : une pièce sale déclarée propre repartirait en
 * prêt sans passer par la liste « À laver ».
 */
export default function ReturnUniformModal({ subject, url, onClose, onReturned }: Props) {
    useEscapeKey(onClose);
    const [state, setState] = useState<'clean' | 'dirty' | null>(null);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (submitting || state === null) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnedClean: state === 'clean', comment: comment.trim() || null }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || 'Erreur lors du rendu');
                // 404 / 409 : la pièce a déjà été rendue (autre onglet, autre
                // appareil) — la card des emprunts doit refléter l'état réel.
                if (res.status === 404 || res.status === 409) notifyUniformsChanged();
                return;
            }
            notifyUniformsChanged();
            onReturned();
        } catch {
            setError('Erreur de connexion — rien n\'a été rendu');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="return-uniform-title" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 id="return-uniform-title" className="modal-title">Rendre {subject}</h2>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {error && (
                            <div className={styles.errorBox} role="alert" style={{ marginBottom: 12 }}>
                                <span className={styles.errorText}>{error}</span>
                            </div>
                        )}
                        <fieldset className={styles.radioGroup}>
                            <legend className="form-label">État de la pièce</legend>
                            <label className={styles.radioOption}>
                                <input
                                    type="radio"
                                    name="return-state"
                                    value="clean"
                                    checked={state === 'clean'}
                                    onChange={() => setState('clean')}
                                />
                                Propre (lavée) — de nouveau disponible
                            </label>
                            <label className={styles.radioOption}>
                                <input
                                    type="radio"
                                    name="return-state"
                                    value="dirty"
                                    checked={state === 'dirty'}
                                    onChange={() => setState('dirty')}
                                />
                                Sale — à laver avant un nouveau prêt
                            </label>
                        </fieldset>
                        <div className="form-group">
                            <label className="form-label" htmlFor="return-comment">Commentaire (facultatif)</label>
                            <textarea
                                id="return-comment"
                                className={`form-input ${styles.textarea}`}
                                value={comment}
                                maxLength={MAX_COMMENT}
                                onChange={e => setComment(e.target.value)}
                                placeholder="Ex. : bouton manquant, tache…"
                            />
                            <div className={styles.counter}>{comment.length} / {MAX_COMMENT}</div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting || state === null}>
                            {submitting ? 'Enregistrement…' : 'Confirmer le rendu'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
