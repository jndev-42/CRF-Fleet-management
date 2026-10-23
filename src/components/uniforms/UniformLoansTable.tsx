'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UlLoanRow } from '@/lib/uniforms/loans';
import { UL_LOANS_LIMIT } from '@/lib/uniforms/constants';
import { UNIFORMS_CHANGED_EVENT, formatDateTime } from './events';
import styles from './uniforms.module.css';

/**
 * Onglet « Emprunts » : qui a emprunté quoi parmi les articles de l'UL active,
 * quelle que soit l'UL de l'emprunteur, emprunts en cours seulement (le journal
 * complet est l'onglet « Historique »). `canAccessAdminPanel` ou `canManageUniforms`.
 */
export default function UniformLoansTable() {
    const [loans, setLoans] = useState<UlLoanRow[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLoans = useCallback(async () => {
        try {
            const res = await fetch('/api/uniforms/loans/ul');
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
    }, []);

    useEffect(() => {
        fetchLoans();
        window.addEventListener(UNIFORMS_CHANGED_EVENT, fetchLoans);
        return () => window.removeEventListener(UNIFORMS_CHANGED_EVENT, fetchLoans);
    }, [fetchLoans]);

    return (
        <div className={styles.section}>
            {error && <div className={styles.errorBox} role="alert"><span className={styles.errorText}>{error}</span></div>}

            {loading ? (
                <div className={styles.loading} role="status">Chargement…</div>
            ) : loans.length === 0 ? (
                <div className={styles.emptyState}>Aucun emprunt en cours.</div>
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
                                <th>État</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loans.map(loan => (
                                <tr key={loan.loanId}>
                                    <td>{loan.borrowerName || loan.borrowerEmail || '—'}</td>
                                    <td>{loan.itemName} {loan.sizeLabel}</td>
                                    <td>{formatDateTime(loan.borrowedAt)}</td>
                                    <td><span className={styles.badgeOpen}>En cours</span></td>
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
