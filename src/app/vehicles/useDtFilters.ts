'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { parseDtWindow, type DtAvailabilityStatus } from '@/lib/dtAvailability';
import {
    DEFAULT_DT_FILTERS,
    buildDtFilterParams,
    defaultDtPeriod,
    dispoOptionsFor,
    parseDtFilterParams,
    type DtFilterState,
    type DtMode,
} from './dtFilters';

/** Fenêtre transmise à l'API : `null` = Maintenant ; `'invalid'` = période refusée, aucun calcul. */
export type DtFetchWindow = { from: string; to: string } | null | 'invalid';

const PERIOD_DEBOUNCE_MS = 400;

/**
 * État des filtres de la Vue DT, porté par l'URL seule (`vue`, `quand`, `debut`, `fin`,
 * `dispo`, `type`) : un lien copié restaure exactement la même vue. `router.replace`
 * évite d'empiler une entrée d'historique à chaque clic sur une puce.
 */
export function useDtFilters(canAccessDtView: boolean) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const parsed = useMemo(() => parseDtFilterParams(new URLSearchParams(searchParams.toString())), [searchParams]);
    // `vue=dt` sans rôle DT ni dtCode : Vue UL, paramètres DT ignorés.
    const isDtView = parsed.isDt && canAccessDtView;
    const state = parsed.state;
    // POTENTIAL n'a pas de sens en mode Maintenant : la puce n'est pas proposée, la valeur est ignorée.
    const dispo = useMemo(
        () => state.dispo.filter((s) => dispoOptionsFor(state.mode).includes(s)),
        [state.dispo, state.mode],
    );

    // Période de la session, restaurée en repassant en mode Période (absente de l'URL en mode Maintenant).
    const lastPeriod = useRef<{ from: string; to: string } | null>(null);
    useEffect(() => {
        if (state.mode === 'period' && state.from && state.to) lastPeriod.current = { from: state.from, to: state.to };
    }, [state.mode, state.from, state.to]);

    const write = useCallback((isDt: boolean, next: DtFilterState) => {
        const params = buildDtFilterParams(new URLSearchParams(searchParams.toString()), isDt, next);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [searchParams, router, pathname]);

    const setDtView = useCallback((on: boolean) => write(on, on ? state : DEFAULT_DT_FILTERS), [write, state]);

    const setMode = useCallback((mode: DtMode) => {
        if (mode === 'now') {
            write(true, { ...state, mode: 'now', from: null, to: null });
            return;
        }
        const fallback = defaultDtPeriod(new Date());
        const period = lastPeriod.current ?? { from: fallback.from.toISOString(), to: fallback.to.toISOString() };
        write(true, { ...state, mode: 'period', ...period });
    }, [write, state]);

    const setPeriod = useCallback((from: Date, to: Date) => {
        write(true, { ...state, mode: 'period', from: from.toISOString(), to: to.toISOString() });
    }, [write, state]);

    const toggleDispo = useCallback((status: DtAvailabilityStatus) => {
        const next = dispo.includes(status) ? dispo.filter((s) => s !== status) : [...dispo, status];
        write(true, { ...state, dispo: next });
    }, [write, state, dispo]);

    const toggleType = useCallback((type: string) => {
        const next = state.types.includes(type) ? state.types.filter((t) => t !== type) : [...state.types, type];
        write(true, { ...state, types: next });
    }, [write, state]);

    const reset = useCallback(() => write(true, DEFAULT_DT_FILTERS), [write]);

    // Validation côté client avec la même règle que l'API : une période refusée ne part pas.
    const periodCheck = state.mode === 'period' ? parseDtWindow(state.from, state.to, new Date()) : null;
    const periodError = periodCheck && !periodCheck.ok ? periodCheck : null;

    const windowKey = state.mode === 'now' ? 'now' : periodError ? 'invalid' : `${state.from}|${state.to}`;
    const debouncedKey = useDebouncedValue(windowKey, windowKey.includes('|') ? PERIOD_DEBOUNCE_MS : 0);
    const fetchWindow: DtFetchWindow = useMemo(() => {
        if (debouncedKey === 'now') return null;
        if (debouncedKey === 'invalid') return 'invalid';
        const [from, to] = debouncedKey.split('|');
        return { from, to };
    }, [debouncedKey]);

    return {
        isDtView,
        mode: state.mode,
        from: state.from,
        to: state.to,
        dispo,
        types: state.types,
        periodError,
        /** Vrai tant que la fenêtre saisie n'a pas encore été transmise (anti-rebond). */
        pendingWindow: debouncedKey !== windowKey,
        fetchWindow,
        setDtView,
        setMode,
        setPeriod,
        toggleDispo,
        toggleType,
        reset,
    };
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);
    return debounced;
}
