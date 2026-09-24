'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UlLoanRow } from '@/lib/uniforms/loans';
import { UL_LOANS_LIMIT } from '@/lib/uniforms/constants';
import { UNIFORMS_CHANGED_EVENT, formatDateTime } from './events';
import styles from './uniforms.module.css';

type Status = 'open' | 'all';

function StateBadge({ loan }: { loan: UlLoanRow }) {
    if (!loan.returnedAt) return <span className={styles.badgeOpen}>En cours</span>;
    if (loan.returnedClean) return <span className={styles.badgeClean}>Rendue propre</span>;
    if (loan.washedAt) {
        return <span className={styles.badgeClean}>Lavée{loan.washedByName ? ` par ${loan.washedByName}` : ''}</span>;
    }
    return <span className={styles.badgeDirty}>Rendue sale — à laver</span>;
}

/**
 * Onglet « Emprunts » : qui a emprunté quoi parmi les articles de l'UL active,
 * quelle que soit l'UL de l'emprunteur. Réservé à `canAccessAdminPanel`.
 */
export default function UniformLoansTable() {
    const [status, setStatus] = useState<Status>('open');
    const [loans, setLoans] = useState<UlLoanRow[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLoans = useCallback(async () => {
        try {
            const res = await fetch(`/api/uniforms/loans/ul?status=${status}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data.error || 'Erreur de chargement'); return; }
            setError(null);
            setLoans(data.loans ?? []);
            setTruncated(Boolean(data.truncated));
        } catch {
            setError('Erreur de connexion');
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => {
        fetchLoans();
        window.addEventListener(UNIFORMS_CHANGED_EVENT, fetchLoans);
        return () => window.removeEventListener(UNIFORMS_CHANGED_EVENT, fetchLoans);
    }, [fetchLoans]);

    return (
        <div className={styles.section}>
            <div className="filters-bar" role="tablist" aria-label="Filtre des emprunts">
                <button role="tab" aria-selected={status === 'open'} className={`filter-btn${status === 'open' ? ' active' : ''}`} onClick={() => setStatus('open')}>
                    En cours
                </button>
                <button role="tab" aria-selected={status === 'all'} className={`filter-btn${status === 'all' ? ' active' : ''}`} onClick={() => setStatus('all')}>
                    Tout l&apos;historique
                </button>
            </div>

            {error && <div className={styles.errorBox} role="alert"><span className={styles.errorText}>{error}</span></div>}

            {loading ? (
                <div className={styles.loading} role="status">Chargement…</div>
            ) : loans.length === 0 ? (
                <div className={styles.emptyState}>Aucun emprunt.</div>
            ) : (
                <>
                {truncated && (
                    <p className={styles.pieceMeta} role="note">
                        Seuls les {UL_LOANS_LIMIT} emprunts les plus récents sont affichés.
                    </p>
                )}
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Emprunteur</th>
                                <th>Pièce</th>
                                <th>Emprunté le</th>
                                <th>Rendu le</th>
                                <th>État</th>
                                <th>Commentaire</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loans.map(loan => (
                                <tr key={loan.loanId}>
                                    <td>{loan.borrowerName || loan.borrowerEmail || '—'}</td>
                                    <td>{loan.itemName} {loan.sizeLabel}</td>
                                    <td>{formatDateTime(loan.borrowedAt)}</td>
                                    <td>{formatDateTime(loan.returnedAt) || '—'}</td>
                                    <td><StateBadge loan={loan} /></td>
                                    <td>{loan.returnComment || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                </>
            )}
        </div>
    );
}
