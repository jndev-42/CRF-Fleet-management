'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { isQrBlocked } from '@/lib/roles';
import type { MyLoanBatch } from '@/lib/uniforms/loans';
import ReturnUniformModal from './ReturnUniformModal';
import { UNIFORMS_CHANGED_EVENT, formatDateTime } from './events';
import styles from './uniforms.module.css';

interface ReturnTarget {
    subject: string;
    url: string;
}

/**
 * Card « Mes pièces empruntées », affichée en haut de la page Uniformes et de
 * la page QR, au-dessus du catalogue. Liste toutes les pièces détenues par
 * l'utilisateur, toutes UL confondues.
 *
 * « Rendre » par pièce, « Tout rendre » par emprunt validé. Masquée quand rien
 * n'est détenu. Rafraîchie par `UNIFORMS_CHANGED_EVENT` (emprunt, rendu) et au
 * retour sur l'onglet (un rendu fait depuis un autre appareil).
 */
export default function UniformMyLoansCard() {
    const { data: session, status } = useSession();
    const [batches, setBatches] = useState<MyLoanBatch[]>([]);
    const [target, setTarget] = useState<ReturnTarget | null>(null);

    const roles = (session?.user?.roles || []) as string[];
    const enabled = status === 'authenticated' && !isQrBlocked(roles);

    const fetchLoans = useCallback(() => {
        fetch('/api/uniforms/loans/mine')
            .then(res => res.ok ? res.json() : null)
            .then((data: { batches: MyLoanBatch[] } | null) => { if (data) setBatches(data.batches); })
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (!enabled) return;
        const onVisibility = () => { if (!document.hidden) fetchLoans(); };
        fetchLoans();
        window.addEventListener(UNIFORMS_CHANGED_EVENT, fetchLoans);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener(UNIFORMS_CHANGED_EVENT, fetchLoans);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [enabled, fetchLoans]);

    if (!enabled || batches.length === 0) return null;

    const count = batches.reduce((sum, b) => sum + b.pieces.length, 0);

    return (
        <section className={styles.loansCard} aria-labelledby="my-uniform-loans-title">
            <h2 id="my-uniform-loans-title" className={styles.loansCardTitle}>
                Mes pièces empruntées ({count})
            </h2>

            {batches.map(batch => (
                <div key={batch.batchId} className={styles.batch}>
                    <div className={styles.batchHeader}>
                        <span className={styles.batchTitle}>
                            Emprunt du {formatDateTime(batch.createdAt)}{batch.ulName ? ` — UL ${batch.ulName}` : ''}
                        </span>
                        {batch.pieces.length > 1 && (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setTarget({
                                    subject: `les ${batch.pieces.length} pièces de l'emprunt du ${formatDateTime(batch.createdAt)}`,
                                    url: `/api/uniforms/loan-batches/${encodeURIComponent(batch.batchId)}/return`,
                                })}
                            >
                                Tout rendre
                            </button>
                        )}
                    </div>
                    <ul className={styles.pieceList}>
                        {batch.pieces.map(piece => (
                            <li key={piece.loanId} className={styles.pieceRow}>
                                <span className={styles.pieceInfo}>
                                    <span className={styles.pieceName}>{piece.itemName} {piece.sizeLabel}</span>
                                </span>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => setTarget({
                                        subject: `${piece.itemName} ${piece.sizeLabel}`,
                                        url: `/api/uniforms/loans/${encodeURIComponent(piece.loanId)}/return`,
                                    })}
                                    aria-label={`Rendre ${piece.itemName} ${piece.sizeLabel}`}
                                >
                                    Rendre
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}

            {target && (
                <ReturnUniformModal
                    subject={target.subject}
                    url={target.url}
                    onClose={() => setTarget(null)}
                    onReturned={() => { setTarget(null); fetchLoans(); }}
                />
            )}
        </section>
    );
}
