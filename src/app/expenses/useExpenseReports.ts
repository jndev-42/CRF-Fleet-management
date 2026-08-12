import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpenseReport } from './types';

/**
 * Owns fetching of the expense reports list (scope/filter-driven) for the expenses page.
 */
export function useExpenseReports(
    status: 'authenticated' | 'loading' | 'unauthenticated',
    isManager: boolean,
    isTresorier: boolean,
) {
    const [reports, setReports] = useState<ExpenseReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [tableLoading, setTableLoading] = useState(false);
    const [viewScope, setViewScope] = useState<'ul' | 'my'>('my');
    const [hasInitializedScope, setHasInitializedScope] = useState(false);
    const [includeProcessed, setIncludeProcessed] = useState(false);

    useEffect(() => {
        if (status === 'authenticated' && !hasInitializedScope) {
            if (isManager || isTresorier) {
                setViewScope('ul');
            }
            setHasInitializedScope(true);
        }
    }, [status, isManager, isTresorier, hasInitializedScope]);

    const fetchReportsAbortRef = useRef<AbortController | null>(null);

    const fetchReports = useCallback(async () => {
        fetchReportsAbortRef.current?.abort();
        const controller = new AbortController();
        fetchReportsAbortRef.current = controller;
        try {
            setTableLoading(true);
            const params = new URLSearchParams();
            params.set('scope', viewScope);
            if (includeProcessed) params.set('includeProcessed', 'true');

            const res = await fetch(`/api/expenses?${params.toString()}`, { signal: controller.signal });
            if (res.ok) {
                const data = await res.json();
                setReports(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return;
            console.error('Failed to fetch expense reports', error);
        } finally {
            if (fetchReportsAbortRef.current === controller) {
                setLoading(false);
                setTableLoading(false);
            }
        }
    }, [viewScope, includeProcessed]);

    useEffect(() => {
        if (status === 'authenticated' && hasInitializedScope) {
            fetchReports();
        }
        return () => fetchReportsAbortRef.current?.abort();
    }, [status, hasInitializedScope, fetchReports]);

    return {
        reports,
        loading,
        tableLoading,
        viewScope,
        setViewScope,
        includeProcessed,
        setIncludeProcessed,
        fetchReports,
    };
}
