'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AuditLogEntry } from './AuditLogTab';

interface AuditLogResponse {
    entries: AuditLogEntry[];
    page: number;
    total: number;
    totalPages: number;
    asOf: string;
    error?: string;
}

export const AUDIT_PAGE_SIZE = 10;

function parsePage(raw: string | null): number {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Données du journal d'audit. La page (`page`) et la personne filtrée (`personne`) vivent
 * dans l'URL : un rechargement ou un lien copié rouvre la même vue. `router.replace`
 * n'empile pas d'entrée d'historique à chaque page.
 *
 * La liste est figée à l'instant du premier chargement (`asOf`) : de nouveaux événements
 * ne font pas glisser les pages. « Actualiser » ou un changement de personne la refige.
 */
export function useAuditLog() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const page = parsePage(searchParams.get('page'));
    const userEmail = (searchParams.get('personne') ?? '').toLowerCase();

    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    // Instant auquel la liste est figée ; `null` = à prendre sur la prochaine réponse.
    const asOfRef = useRef<string | null>(null);
    // Seule la dernière requête lancée a le droit d'écrire : une réponse arrivée après
    // un changement de personne ou de page ne doit pas remplacer la liste affichée.
    const requestIdRef = useRef(0);

    const writeUrl = useCallback((changes: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(changes)) {
            if (value) params.set(key, value);
            else params.delete(key);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [searchParams, router, pathname]);

    const setPage = useCallback((next: number) => {
        writeUrl({ page: next > 1 ? String(next) : null });
    }, [writeUrl]);

    const setUserEmail = useCallback((email: string) => {
        asOfRef.current = null;
        writeUrl({ personne: email || null, page: null });
    }, [writeUrl]);

    const refresh = useCallback(() => {
        asOfRef.current = null;
        if (page !== 1) setPage(1);
        else setRefreshKey(k => k + 1);
    }, [page, setPage]);

    // Le repli sur la dernière page écrit l'URL du moment, sans relancer la requête à chaque écriture.
    const setPageRef = useRef(setPage);
    useEffect(() => {
        setPageRef.current = setPage;
    }, [setPage]);

    useEffect(() => {
        const requestId = ++requestIdRef.current;
        const run = async () => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE), page: String(page) });
                if (userEmail) params.set('userEmail', userEmail);
                if (asOfRef.current) params.set('asOf', asOfRef.current);
                const res = await fetch(`/api/audit-logs?${params.toString()}`);
                const data = await res.json().catch(() => ({})) as Partial<AuditLogResponse>;
                if (requestId !== requestIdRef.current) return;
                if (!res.ok) throw new Error(data.error || 'Erreur serveur');
                if (!asOfRef.current && data.asOf) asOfRef.current = data.asOf;
                const pages = Math.max(1, data.totalPages ?? 1);
                setTotal(data.total ?? 0);
                setTotalPages(pages);
                // La page demandée n'existe pas (lien ancien, purge) : on se replie sur la dernière.
                if (page > pages) {
                    setPageRef.current(pages);
                    return;
                }
                setEntries(data.entries ?? []);
            } catch (e: unknown) {
                if (requestId === requestIdRef.current) setError(e instanceof Error ? e.message : 'Erreur serveur');
            } finally {
                if (requestId === requestIdRef.current) setLoading(false);
            }
        };
        void run();
    }, [userEmail, page, refreshKey]);

    return { entries, page, total, totalPages, userEmail, loading, error, setPage, setUserEmail, refresh };
}
