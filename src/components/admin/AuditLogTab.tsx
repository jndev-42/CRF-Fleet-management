'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
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

interface AuditLogResponse {
    entries: AuditLogEntry[];
    nextBefore: string | null;
    error?: string;
}

interface AuditLogTabProps {
    /** Liste des utilisateurs déjà chargée par la page Administration (sélecteur de personne). */
    users: { email: string; name: string | null }[];
}

const PAGE_SIZE = 50;

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

/** Onglet SUPER_ADMIN : derniers événements du journal d'audit, filtrables par personne. */
export default function AuditLogTab({ users }: AuditLogTabProps) {
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [nextBefore, setNextBefore] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Seule la dernière requête lancée a le droit d'écrire : une réponse arrivée après
    // un changement de personne ne doit ni remplacer ni compléter la nouvelle liste.
    const requestIdRef = useRef(0);

    const load = useCallback(async (email: string, before: string | null) => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
            if (email) params.set('userEmail', email);
            if (before) params.set('before', before);
            const res = await fetch(`/api/audit-logs?${params.toString()}`);
            const data = await res.json().catch(() => ({})) as Partial<AuditLogResponse>;
            if (requestId !== requestIdRef.current) return;
            if (!res.ok) throw new Error(data.error || 'Erreur serveur');
            const page = data.entries ?? [];
            setEntries(prev => (before ? [...prev, ...page] : page));
            setNextBefore(data.nextBefore ?? null);
        } catch (e: unknown) {
            if (requestId === requestIdRef.current) setError(e instanceof Error ? e.message : 'Erreur serveur');
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(userEmail, null);
    }, [load, userEmail]);

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

            {!loading && nextBefore && (
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void load(userEmail, nextBefore)}
                >
                    Charger plus
                </button>
            )}
        </section>
    );
}
