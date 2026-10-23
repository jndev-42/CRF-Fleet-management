'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoryEvent, HistoryPage, HistoryTypeFilter } from '@/lib/uniforms/history';
import { UNIFORMS_CHANGED_EVENT, formatDateTime } from './events';
import styles from './uniforms.module.css';

const FILTERS: { value: HistoryTypeFilter; label: string }[] = [
    { value: 'all', label: 'Tout' },
    { value: 'loan', label: 'Emprunts' },
    { value: 'return', label: 'Rendus' },
    { value: 'wash', label: 'Lavages' },
];

const SEARCH_DEBOUNCE_MS = 300;

function pieceLabels(event: HistoryEvent): string {
    return event.pieces.map(p => `${p.itemName} ${p.sizeLabel}`).join(', ');
}

function EventLine({ event }: { event: HistoryEvent }) {
    const who = event.borrowerName || event.borrowerEmail || '—';
    const pieces = pieceLabels(event);

    if (event.type === 'loan') {
        return (
            <>
                <span className={styles.badgeOpen}>Emprunt</span>{' '}
                <strong>{who}</strong> a emprunté {pieces}
                {event.source === 'qr' ? ' (via QR)' : ''}
            </>
        );
    }
    if (event.type === 'return') {
        return (
            <>
                {event.returnedClean
                    ? <span className={styles.badgeClean}>Rendu propre</span>
                    : <span className={styles.badgeDirty}>Rendu sale</span>}{' '}
                <strong>{who}</strong> a rendu {pieces}
                {event.returnComment && <div className={styles.pieceMeta}>{event.returnComment}</div>}
            </>
        );
    }
    return (
        <>
            <span className={styles.badgeClean}>Lavage</span>{' '}
            {pieces}{event.washedByName ? <> lavé par <strong>{event.washedByName}</strong></> : ' lavé'}
            <div className={styles.pieceMeta}>Emprunté par {who}</div>
        </>
    );
}

/**
 * Onglet « Historique » : journal des emprunts, rendus et lavages des pièces de
 * l'UL active, du plus récent au plus ancien, 50 événements par page.
 * Réservé à `canManageUniforms`.
 */
export default function UniformHistory() {
    const [type, setType] = useState<HistoryTypeFilter>('all');
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    const [events, setEvents] = useState<HistoryEvent[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Une réponse tardive d'un filtre précédent ne doit pas écraser la liste courante.
    const requestId = useRef(0);

    // Valeur de `q` déjà appliquée : le délai de saisie ne réinitialise la liste que si elle change.
    const appliedQ = useRef('');

    /**
     * Nouveau filtre : on abandonne les réponses en vol (`requestId`) et on repart
     * d'une liste vide en chargement, pour ne ni montrer l'ancienne liste ni
     * réutiliser son curseur. Appelé depuis les gestionnaires, jamais depuis un effet.
     */
    const resetList = () => {
        requestId.current += 1;
        setEvents([]);
        setNextCursor(null);
        setHasMore(false);
        setError(null);
        setLoading(true);
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            const next = search.trim();
            if (next === appliedQ.current) return;
            appliedQ.current = next;
            resetList();
            setQ(next);
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [search]);

    const selectType = (value: HistoryTypeFilter) => {
        if (value === type) return;
        resetList();
        setType(value);
    };

    const buildUrl = useCallback((cursor: string | null) => {
        const params = new URLSearchParams({ type });
        if (q) params.set('q', q);
        if (cursor) params.set('cursor', cursor);
        return `/api/uniforms/history?${params.toString()}`;
    }, [type, q]);

    const reload = useCallback(async () => {
        const id = ++requestId.current;
        try {
            const res = await fetch(buildUrl(null));
            const data = await res.json().catch(() => ({}));
            if (id !== requestId.current) return;
            if (!res.ok) { setError(data.error || 'Erreur de chargement'); return; }
            const first = data as HistoryPage;
            setError(null);
            setEvents(first.events);
            setNextCursor(first.nextCursor);
            setHasMore(first.hasMore);
        } catch {
            if (id === requestId.current) setError('Erreur de connexion');
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, [buildUrl]);

    useEffect(() => {
        reload();
        window.addEventListener(UNIFORMS_CHANGED_EVENT, reload);
        return () => window.removeEventListener(UNIFORMS_CHANGED_EVENT, reload);
    }, [reload]);

    const loadMore = async () => {
        if (!nextCursor || loadingMore) return;
        const id = requestId.current;
        setLoadingMore(true);
        try {
            const res = await fetch(buildUrl(nextCursor));
            const data = await res.json().catch(() => ({}));
            if (id !== requestId.current) return;
            if (!res.ok) { setError(data.error || 'Erreur de chargement'); return; }
            const next = data as HistoryPage;
            setError(null);
            setEvents(prev => {
                const known = new Set(prev.map(e => e.key));
                return [...prev, ...next.events.filter(e => !known.has(e.key))];
            });
            setNextCursor(next.nextCursor);
            setHasMore(next.hasMore);
        } catch {
            if (id === requestId.current) setError('Erreur de connexion');
        } finally {
            setLoadingMore(false);
        }
    };

    return (
        <div className={styles.section}>
            <div className={styles.toolbar}>
                <div className="filters-bar" role="tablist" aria-label="Type d'événement">
                    {FILTERS.map(f => (
                        <button
                            key={f.value}
                            type="button"
                            role="tab"
                            aria-selected={type === f.value}
                            className={`filter-btn${type === f.value ? ' active' : ''}`}
                            onClick={() => selectType(f.value)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <input
                    type="search"
                    className={`form-input ${styles.searchInput}`}
                    placeholder="Rechercher un emprunteur ou une pièce"
                    aria-label="Rechercher dans l'historique"
                    maxLength={100}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {error && <div className={styles.errorBox} role="alert"><span className={styles.errorText}>{error}</span></div>}

            {loading ? (
                <div className={styles.loading} role="status">Chargement…</div>
            ) : events.length === 0 ? (
                !error && <div className={styles.emptyState}>Aucun événement.</div>
            ) : (
                <>
                    <ul className={styles.eventList}>
                        {events.map(event => (
                            <li key={event.key} className={styles.eventRow}>
                                <span className={styles.eventDate}>{formatDateTime(event.at)}</span>
                                <div className={styles.eventBody}><EventLine event={event} /></div>
                            </li>
                        ))}
                    </ul>
                    {hasMore && (
                        <button type="button" className={`btn btn-secondary ${styles.loadMore}`} onClick={loadMore} disabled={loadingMore}>
                            {loadingMore ? 'Chargement…' : 'Charger plus'}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
