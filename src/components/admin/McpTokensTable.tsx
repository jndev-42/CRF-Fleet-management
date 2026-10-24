'use client';

import { useState } from 'react';
import type { McpTokenItem } from './useMcpTokens';
import styles from './McpTokensTab.module.css';

interface McpTokensTableProps {
    tokens: McpTokenItem[];
    /** SUPER_ADMIN : colonne « Propriétaire » (il voit et révoque tous les jetons). */
    showOwner: boolean;
    loading: boolean;
    onRevoke: (id: string, name: string) => void;
}

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type TokenState = 'active' | 'expired' | 'revoked';

function stateOf(token: McpTokenItem, now: number): TokenState {
    if (token.revokedAt) return 'revoked';
    return Date.parse(token.expiresAt) <= now ? 'expired' : 'active';
}

const STATE_LABELS: Record<TokenState, string> = { active: 'Actif', expired: 'Expiré', revoked: 'Révoqué' };

/** Liste des jetons d'accès IA (jamais le jeton lui-même, seulement son préfixe). */
export default function McpTokensTable({ tokens, showOwner, loading, onRevoke }: McpTokensTableProps) {
    // Instant figé au montage : l'état « expiré » ne bascule pas d'un rendu à l'autre.
    const [now] = useState(() => Date.now());
    const columns = showOwner ? 8 : 7;

    return (
        <div className={styles.tableWrapper}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">Nom</th>
                        {showOwner && <th scope="col">Propriétaire</th>}
                        <th scope="col">Portée</th>
                        <th scope="col">Jeton</th>
                        <th scope="col">Créé le</th>
                        <th scope="col">Expire le</th>
                        <th scope="col">Dernière utilisation</th>
                        <th scope="col">État</th>
                    </tr>
                </thead>
                <tbody>
                    {tokens.map(token => {
                        const state = stateOf(token, now);
                        return (
                            <tr key={token.id}>
                                <td className={styles.name}>{token.name}</td>
                                {showOwner && <td className={styles.meta}>{token.userName || token.userEmail || token.userId}</td>}
                                <td>{token.scope === 'write' ? 'Lecture et écriture' : 'Lecture seule'}</td>
                                <td><code className={styles.prefix}>{token.tokenPrefix}…</code></td>
                                <td>{formatDate(token.createdAt)}</td>
                                <td>{formatDate(token.expiresAt)}</td>
                                <td>{formatDate(token.lastUsedAt)}</td>
                                <td>
                                    <div className={styles.stateCell}>
                                        <span className={`${styles.state} ${styles[state]}`}>{STATE_LABELS[state]}</span>
                                        {state === 'active' && (
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => onRevoke(token.id, token.name)}
                                                aria-label={`Révoquer le jeton ${token.name}`}
                                            >
                                                Révoquer
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    {!loading && tokens.length === 0 && (
                        <tr>
                            <td colSpan={columns} className={styles.empty}>Aucun jeton pour l&apos;instant.</td>
                        </tr>
                    )}
                    {loading && (
                        <tr>
                            <td colSpan={columns} className={styles.empty}>Chargement…</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
