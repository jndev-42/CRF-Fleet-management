'use client';

import { useState, useEffect, useRef } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import styles from './ImportCsvModal.module.css';

/** Erreur de ligne renvoyée par `POST /api/inventory/stocks/import`. */
interface CsvLineError {
    line: number;
    column: string;
    reason: string;
}

interface ImportCsvModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Appelé après un import réussi, avec le stock créé. */
    onSuccess: (result: { stockId: string; itemCount: number }) => void;
}

export default function ImportCsvModal({ isOpen, onClose, onSuccess }: ImportCsvModalProps) {
    useEscapeKey(onClose, isOpen);
    const [name, setName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [lineErrors, setLineErrors] = useState<CsvLineError[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setName('');
            setError('');
            setLineErrors([]);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        const file = fileInputRef.current?.files?.[0];

        if (!name.trim()) {
            setError('Le nom du stock est requis');
            return;
        }
        if (!file) {
            setError('Sélectionnez un fichier CSV');
            return;
        }

        setSubmitting(true);
        setError('');
        setLineErrors([]);

        try {
            const formData = new FormData();
            formData.append('name', name.trim());
            formData.append('file', file);

            const res = await fetch('/api/inventory/stocks/import', { method: 'POST', body: formData });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Erreur lors de l\'import');
                setLineErrors(data.lines ?? []);
                return;
            }

            onSuccess({ stockId: data.stockId, itemCount: data.itemCount });
            onClose();
        } catch {
            setError('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={`modal-overlay ${styles.overlay}`} onClick={onClose}>
            <div className={`modal ${styles.modal}`} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">📥 Importer un CSV</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {error && (
                            <div className={styles.errorBox} role="alert">
                                {error}
                            </div>
                        )}

                        {lineErrors.length > 0 && (
                            <div className={styles.lineErrors}>
                                <ul className={styles.lineErrorsList}>
                                    {lineErrors.map((lineError, index) => (
                                        <li key={`${lineError.line}-${lineError.column}-${index}`} className={styles.lineErrorItem}>
                                            <strong>Ligne {lineError.line}</strong>
                                            {lineError.column && <> — colonne <code>{lineError.column}</code></>}
                                            {' : '}{lineError.reason}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Nom du stock *</label>
                            <input
                                className="form-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="ex: Stock Véhicules, Réserve Pharmacie..."
                                autoFocus
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Fichier CSV *</label>
                            <input
                                className="form-input"
                                type="file"
                                accept=".csv"
                                ref={fileInputRef}
                                required
                            />
                            <p className={styles.formatHint}>
                                Encodage UTF-8, séparateur point-virgule, en-tête obligatoire en première ligne :
                                <br />
                                <code>nom;categorie;quantite;date_peremption;stock_min;notes</code>
                                <br />
                                Seule la colonne <code>nom</code> est obligatoire. Les dates s&apos;écrivent <code>AAAA-MM-JJ</code>.
                                Si une seule ligne est invalide, rien n&apos;est importé.
                                <br />
                                Limites : 2000 lignes de données et 2 Mo maximum.
                            </p>
                        </div>
                    </div>
                    <div className={`modal-footer ${styles.footer}`}>
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Import en cours...' : 'Importer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
