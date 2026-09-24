'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UniformItemView } from '@/lib/uniforms/catalog';
import { UNIFORMS_CHANGED_EVENT } from './events';

export interface CatalogResponse {
    items: UniformItemView[];
    /** Présent sur la route QR uniquement : l'UL désignée par le token. */
    ul?: { id: string; name: string };
}

type LoadOutcome = { data: CatalogResponse | null; error: string | null } | 'unauthorized' | 'aborted';

async function loadCatalog(url: string, signal: AbortSignal): Promise<LoadOutcome> {
    try {
        const res = await fetch(url, { signal });
        if (res.status === 401) return 'unauthorized';
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: body.error || 'Erreur de chargement' };
        return { data: body as CatalogResponse, error: null };
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return 'aborted';
        return { data: null, error: 'Erreur de connexion' };
    }
}

/**
 * Charge un catalogue (`/api/uniforms/items` ou `/api/qr-uniforms/<token>/catalog`)
 * et le recharge après chaque emprunt, rendu ou lavage.
 *
 * `onUnauthorized` : la page QR redirige vers la connexion sur 401.
 */
export function useUniformCatalog(url: string | null, onUnauthorized?: () => void) {
    // Le résultat est rangé AVEC l'URL qui l'a produit : quand l'URL change
    // (changement d'UL), l'ancien catalogue n'est plus servi, sans avoir à
    // remettre l'état à zéro dans un effet.
    const [result, setResult] = useState<{ url: string | null; data: CatalogResponse | null; error: string | null }>(
        { url: null, data: null, error: null },
    );
    const abortRef = useRef<AbortController | null>(null);

    const refresh = useCallback(async () => {
        if (!url) return;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const next = await loadCatalog(url, controller.signal);
            if (next === 'unauthorized') { onUnauthorized?.(); return; }
            if (next !== 'aborted') setResult({ url, ...next });
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    }, [url, onUnauthorized]);

    useEffect(() => {
        refresh();
        window.addEventListener(UNIFORMS_CHANGED_EVENT, refresh);
        return () => {
            window.removeEventListener(UNIFORMS_CHANGED_EVENT, refresh);
            abortRef.current?.abort();
        };
    }, [refresh]);

    // Tant qu'aucune réponse n'est arrivée pour l'URL courante : chargement.
    const stale = result.url !== url;
    return {
        data: stale ? null : result.data,
        loading: stale,
        error: stale ? null : result.error,
        refresh,
    };
}
