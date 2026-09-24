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
 * Bandeau global des pièces d'uniforme détenues par l'utilisateur, monté dans
 * le layout sous `LicenseBanner`. Replié par défaut : il suit l'utilisateur sur
 * toutes les pages, la liste complète n'est dépliée qu'à la demande.
 *
 * « Rendre » par pièce, « Tout rendre » par emprunt validé. Disparaît dès que
 * tout est rendu. Rafraîchi par `UNIFORMS_CHANGED_EVENT` et au retour sur
 * l'onglet (un rendu fait depuis un autre appareil).
 */
export default function UniformLoansBanner() {
    const { data: session, status } = useSession();
    const [batches, setBatches] = useState<MyLoanBatch[]>([]);
    const [expanded, setExpanded] = useState(false);
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

    const pieces = batches.flatMap(b => b.pieces);
    const summary = pieces.map(p => `${p.itemName} ${p.sizeLabel}`).join(', ');

    return (
        <div className={styles.banner} role="region" aria-label="Uniformes empruntés">
            <div className={styles.bannerHeader}>
                <span aria-hidden="true">👕</span>
                <span className={styles.bannerSummary}>
                    <strong>
                        Vous détenez {pieces.length} pièce{pieces.length > 1 ? 's' : ''} d&apos;uniforme
                    </strong>
                    {!expanded && <> : {summary}</>}
                </span>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setExpanded(v => !v)}
                    aria-expanded={expanded}
                >
                    {expanded ? 'Masquer' : 'Rendre…'}
                </button>
            </div>

            {expanded && (
                <div className={styles.bannerBody}>
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
                </div>
            )}

            {target && (
                <ReturnUniformModal
                    subject={target.subject}
                    url={target.url}
                    onClose={() => setTarget(null)}
                    onReturned={() => { setTarget(null); fetchLoans(); }}
                />
            )}
        </div>
    );
}
