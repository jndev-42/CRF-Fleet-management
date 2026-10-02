/**
 * Tests du hook d'état des filtres de la Vue DT (URL ↔ état).
 *
 * Fichier testé : src/app/vehicles/useDtFilters.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// URL simulée : `router.replace` réécrit les paramètres, le test fait `rerender()` ensuite.
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
    useSearchParams: () => nav.params,
    usePathname: () => '/vehicles',
    useRouter: () => ({ replace: nav.replace }),
}));

import { useDtFilters } from '@/app/vehicles/useDtFilters';

/** Paramètres de la dernière URL écrite par `router.replace`. */
function lastUrl(): URLSearchParams {
    const href = nav.replace.mock.calls.at(-1)?.[0] as string;
    return new URL(href, 'http://localhost').searchParams;
}

/** Applique la dernière URL écrite, comme le ferait Next.js. */
function applyLastUrl() {
    nav.params = lastUrl();
}

// Mercredi 7 octobre 2026, 10:07 (heure locale).
const NOW = new Date(2026, 9, 7, 10, 7);

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    nav.params = new URLSearchParams();
    nav.replace.mockReset();
    nav.replace.mockImplementation(() => undefined);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useDtFilters', () => {
    it('passer en mode Période écrit demain 08:00 → 20:00, puis restaure la période précédente', () => {
        nav.params = new URLSearchParams('vue=dt');
        const { result, rerender } = renderHook(() => useDtFilters(true));
        expect(result.current.isDtView).toBe(true);
        expect(result.current.mode).toBe('now');

        act(() => result.current.setMode('period'));
        let url = lastUrl();
        expect(url.get('quand')).toBe('periode');
        expect(url.get('debut')).toBe(new Date(2026, 9, 8, 8).toISOString());
        expect(url.get('fin')).toBe(new Date(2026, 9, 8, 20).toISOString());

        // L'utilisateur choisit une autre période…
        applyLastUrl();
        rerender();
        act(() => result.current.setPeriod(new Date(2026, 9, 10, 7, 30), new Date(2026, 9, 10, 20, 30)));
        applyLastUrl();
        rerender();

        // … repasse en Maintenant (période absente de l'URL)…
        act(() => result.current.setMode('now'));
        url = lastUrl();
        expect(url.get('quand')).toBeNull();
        expect(url.get('debut')).toBeNull();
        applyLastUrl();
        rerender();

        // … puis revient en Période : la période précédente est restaurée.
        act(() => result.current.setMode('period'));
        url = lastUrl();
        expect(url.get('debut')).toBe(new Date(2026, 9, 10, 7, 30).toISOString());
        expect(url.get('fin')).toBe(new Date(2026, 9, 10, 20, 30).toISOString());
    });

    it('setDtView(false) retire tous les paramètres DT et conserve les autres', () => {
        nav.params = new URLSearchParams(`autre=1&vue=dt&quand=periode&debut=${new Date(2026, 9, 10, 8).toISOString()}&fin=${new Date(2026, 9, 10, 20).toISOString()}&dispo=disponible&type=VPSP`);
        const { result } = renderHook(() => useDtFilters(true));

        act(() => result.current.setDtView(false));

        const url = lastUrl();
        expect([...url.keys()]).toEqual(['autre']);
        expect(nav.replace.mock.calls.at(-1)?.[1]).toEqual({ scroll: false });
    });

    it('vue=dt sans accès DT → isDtView false', () => {
        nav.params = new URLSearchParams('vue=dt&dispo=disponible');
        const { result } = renderHook(() => useDtFilters(false));
        expect(result.current.isDtView).toBe(false);
    });

    it('période invalide → fetchWindow « invalid » et erreur exposée', () => {
        nav.params = new URLSearchParams(`vue=dt&quand=periode&debut=${new Date(2026, 9, 10, 20).toISOString()}&fin=${new Date(2026, 9, 10, 8).toISOString()}`);
        const { result } = renderHook(() => useDtFilters(true));
        act(() => { vi.runAllTimers(); });

        expect(result.current.fetchWindow).toBe('invalid');
        expect(result.current.periodError?.code).toBe('ORDER');
    });

    it('période valide → fetchWindow transmise après l’anti-rebond de 400 ms', () => {
        const from = new Date(2026, 9, 10, 8).toISOString();
        const to = new Date(2026, 9, 10, 20).toISOString();
        nav.params = new URLSearchParams('vue=dt');
        const { result, rerender } = renderHook(() => useDtFilters(true));
        act(() => { vi.runAllTimers(); });
        expect(result.current.fetchWindow).toBeNull();

        nav.params = new URLSearchParams(`vue=dt&quand=periode&debut=${from}&fin=${to}`);
        rerender();
        act(() => { vi.advanceTimersByTime(399); });
        expect(result.current.fetchWindow).toBeNull();
        expect(result.current.pendingWindow).toBe(true);

        act(() => { vi.advanceTimersByTime(1); });
        expect(result.current.fetchWindow).toEqual({ from, to });
        expect(result.current.pendingWindow).toBe(false);
    });

    it('dispo=potentiel ignoré en mode Maintenant, conservé en mode Période', () => {
        nav.params = new URLSearchParams('vue=dt&dispo=potentiel,disponible');
        const { result, rerender } = renderHook(() => useDtFilters(true));
        expect(result.current.dispo).toEqual(['AVAILABLE']);

        nav.params = new URLSearchParams(`vue=dt&quand=periode&debut=${new Date(2026, 9, 10, 8).toISOString()}&fin=${new Date(2026, 9, 10, 20).toISOString()}&dispo=potentiel,disponible`);
        rerender();
        expect(result.current.dispo).toEqual(['POTENTIAL', 'AVAILABLE']);
    });
});
