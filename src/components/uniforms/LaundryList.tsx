'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LaundryPiece } from '@/lib/uniforms/laundry';
import { UNIFORMS_CHANGED_EVENT, formatDateTime, notifyUniformsChanged } from './events';
import styles from './uniforms.module.css';

interface Props {
    /** `/api/uniforms/laundry` (appli) ou `/api/qr-uniforms/<token>/laundry` (QR). */
    listUrl: string;
    /** Route de marquage d'une pièce, même famille que `listUrl`. */
    markUrl: (loanId: string) => string;
}

/**
 * Liste « À laver » : pièces rendues sales, pas encore lavées. N'importe quel
 * compte actif peut les marquer lavées ; elles redeviennent alors empruntables.
 * Partagée par la page appli et la page QR.
 */
export default function LaundryList({ listUrl, markUrl }: Props) {
    const [pieces, setPieces] = useState<LaundryPiece[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    const fetchPieces = useCallback(async () => {
        try {
            const res = await fetch(listUrl);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || 'Erreur de chargement');
                return;
            }
            setPieces(data.pieces ?? []);
        } catch {
            setError('Erreur de connexion');
        } finally {
            setLoading(false);
        }
    }, [listUrl]);

    useEffect(() => {
        fetchPieces();
        window.addEventListener(UNIFORMS_CHANGED_EVENT, fetchPieces);
        return () => window.removeEventListener(UNIFORMS_CHANGED_EVENT, fetchPieces);
    }, [fetchPieces]);

    async function markWashed(loanId: string) {
        if (pending) return;
        setPending(loanId);
        setError(null);
        try {
            const res = await fetch(markUrl(loanId), { method: 'POST' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Erreur lors du marquage');
            }
            // Dans tous les cas : un 409 signifie qu'un autre bénévole l'a déjà
            // marquée, la liste doit refléter l'état réel.
            notifyUniformsChanged();
        } catch {
            setError('Erreur de connexion');
        } finally {
            setPending(null);
        }
    }

    if (loading) return <div className={styles.loading} role="status">Chargement…</div>;

    return (
        <div className={styles.section}>
            {error && (
                <div className={styles.errorBox} role="alert">
                    <span className={styles.errorText}>{error}</span>
                    <button type="button" className={styles.dismiss} onClick={() => setError(null)} aria-label="Masquer le message d'erreur">✕</button>
                </div>
            )}
            {pieces.length === 0 ? (
                <div className={styles.emptyState}>Aucune pièce à laver.</div>
            ) : (
                <ul className={styles.pieceList}>
                    {pieces.map(piece => (
                        <li key={piece.loanId} className={styles.pieceRow}>
                            <span className={styles.pieceInfo}>
                                <span className={styles.pieceName}>{piece.itemName} {piece.sizeLabel}</span>
                                <span className={styles.pieceMeta}>
                                    {' '}— rendue le {formatDateTime(piece.returnedAt)}
                                    {piece.returnComment ? ` · « ${piece.returnComment} »` : ''}
                                </span>
                            </span>
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => markWashed(piece.loanId)}
                                disabled={pending !== null}
                                aria-label={`Marquer lavée : ${piece.itemName} ${piece.sizeLabel}`}
                            >
                                {pending === piece.loanId ? '…' : 'Marquer lavée'}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
