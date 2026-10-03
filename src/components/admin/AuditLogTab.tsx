'use client';

import { RefreshCw, ScrollText } from 'lucide-react';
import Pagination from '@/components/Pagination';
import { AUDIT_PAGE_SIZE, useAuditLog } from './useAuditLog';
import styles from './AuditLogTab.module.css';

export interface AuditLogEntry {
    id: string;
    createdAt: string;
    actorEmail: string | null;
    actorName: string | null;
    impersonatedEmail: string | null;
    method: string;
    path: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    status: number;
    ip: string | null;
}

interface AuditLogTabProps {
    /** Liste des utilisateurs déjà chargée par la page Administration (sélecteur de personne). */
    users: { email: string; name: string | null }[];
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function resourceLabel(entry: AuditLogEntry): string {
    if (entry.entityType && entry.entityId) return `${entry.entityType}/${entry.entityId}`;
    return entry.entityType ?? entry.path;
}

function summary(page: number, total: number): string {
    const first = (page - 1) * AUDIT_PAGE_SIZE + 1;
    const last = Math.min(page * AUDIT_PAGE_SIZE, total);
    return `${first} à ${last} sur ${total} événement${total > 1 ? 's' : ''}`;
}

/** Onglet SUPER_ADMIN : derniers événements du journal d'audit, filtrables par personne. */
export default function AuditLogTab({ users }: AuditLogTabProps) {
    const { entries, page, total, totalPages, userEmail, loading, error, setPage, setUserEmail, refresh } = useAuditLog();

    const sortedUsers = [...users].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'fr'));

    return (
        <section className={styles.container}>
            <div className={styles.toolbar}>
                <label className={styles.filterLabel} htmlFor="audit-user-filter">Personne</label>
                <select
                    id="audit-user-filter"
                    className={`form-select ${styles.filterSelect}`}
                    value={userEmail}
                    onChange={e => setUserEmail(e.target.value)}
                >
                    <option value="">Toutes les personnes</option>
                    {sortedUsers.map(u => (
                        <option key={u.email} value={u.email.toLowerCase()}>
                            {u.name ? `${u.name} (${u.email})` : u.email}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    className={`btn btn-secondary ${styles.refresh}`}
                    onClick={refresh}
                    disabled={loading}
                    title="Afficher les événements arrivés depuis l'ouverture de la liste"
                >
                    <RefreshCw size={14} aria-hidden="true" />
                    Actualiser
                </button>
            </div>

            <p className={styles.help}>
                <ScrollText size={14} aria-hidden="true" />
                Connexions et modifications des 30 derniers jours, la plus récente en haut.
            </p>

            {error && <div className={styles.error} role="alert">{error}</div>}

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Auteur</th>
                            <th scope="col">Action</th>
                            <th scope="col">Ressource</th>
                            <th scope="col">Résultat</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map(entry => {
                            const failed = entry.status >= 400;
                            return (
                                <tr key={entry.id} className={failed ? styles.failedRow : undefined}>
                                    <td className={styles.date}>{formatDate(entry.createdAt)}</td>
                                    <td>
                                        <div className={styles.actor}>{entry.actorName || entry.actorEmail || 'Anonyme'}</div>
                                        {entry.actorName && entry.actorEmail && (
                                            <div className={styles.meta}>{entry.actorEmail}</div>
                                        )}
                                        {entry.impersonatedEmail && (
                                            <div className={styles.meta}>en tant que {entry.impersonatedEmail}</div>
                                        )}
                                    </td>
                                    <td>{entry.action}</td>
                                    <td className={styles.resource} title={`${entry.method} ${entry.path}${entry.ip ? ` · IP ${entry.ip}` : ''}`}>{resourceLabel(entry)}</td>
                                    <td>
                                        <span
                                            className={`${styles.status} ${failed ? styles.statusFailed : styles.statusOk}`}
                                            title={failed ? 'Refusée ou en erreur' : 'Réussie'}
                                        >
                                            {failed ? 'Échec' : 'OK'} · {entry.status}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                        {!loading && entries.length === 0 && !error && (
                            <tr>
                                <td colSpan={5} className={styles.empty}>Aucun événement sur la période.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {loading && <div className={styles.meta}>Chargement…</div>}

            {total > 0 && (
                <Pagination
                    label="Pagination du journal d'audit"
                    page={page}
                    totalPages={totalPages}
                    onChange={setPage}
                    summary={summary(page, total)}
                    extended
                />
            )}
        </section>
    );
}
