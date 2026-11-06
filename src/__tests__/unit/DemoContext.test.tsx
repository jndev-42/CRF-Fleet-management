import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/') }));
import { usePathname } from 'next/navigation';
import { DemoProvider, useDemoMode, IS_DEMO_MODE_KEY } from '@/lib/contexts/DemoContext';

describe('DemoContext', () => {
    const originalReload = window.location.reload;

    beforeEach(() => {
        localStorage.clear();
        document.cookie = 'crf_demo_mode=; path=/; max-age=0';
        vi.mocked(usePathname).mockReturnValue('/');
        Object.defineProperty(window, 'location', {
            value: { ...window.location, reload: vi.fn() },
            writable: true,
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', { value: { ...window.location, reload: originalReload }, writable: true });
    });

    it('installe l\'intercepteur dès l\'import du module, avant tout rendu', () => {
        // Aucun DemoProvider rendu à ce stade : seul l'import a pu l'installer.
        expect((window as unknown as Record<string, unknown>).__crfDemoFetchInstalled).toBe(true);
    });

    it('démarre désactivé si rien en localStorage', () => {
        const { result } = renderHook(() => useDemoMode(), { wrapper: DemoProvider });
        expect(result.current.isDemoMode).toBe(false);
    });

    it('lit l\'état initial depuis localStorage', () => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        const { result } = renderHook(() => useDemoMode(), { wrapper: DemoProvider });
        expect(result.current.isDemoMode).toBe(true);
    });

    it('bascule le mode démo, persiste en localStorage et recharge la page', () => {
        const { result } = renderHook(() => useDemoMode(), { wrapper: DemoProvider });

        act(() => {
            result.current.toggleDemoMode();
        });

        expect(localStorage.getItem(IS_DEMO_MODE_KEY)).toBe('true');
        expect(window.location.reload).toHaveBeenCalled();
    });

    it('pose le cookie à l\'activation et le retire à la sortie', () => {
        const { result } = renderHook(() => useDemoMode(), { wrapper: DemoProvider });
        act(() => result.current.toggleDemoMode());
        expect(document.cookie).toContain('crf_demo_mode=1');
        act(() => result.current.toggleDemoMode());
        expect(document.cookie).not.toContain('crf_demo_mode=1');
        expect(localStorage.getItem(IS_DEMO_MODE_KEY)).toBe('false');
    });

    it('repose le cookie si localStorage est actif sans cookie', () => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        renderHook(() => useDemoMode(), { wrapper: DemoProvider });
        expect(document.cookie).toContain('crf_demo_mode=1');
    });

    it('désactive la démo sur les pages QR', () => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        vi.mocked(usePathname).mockReturnValue('/qr/abc');
        const { result } = renderHook(() => useDemoMode(), { wrapper: DemoProvider });
        expect(result.current.isDemoMode).toBe(false);
    });

    it('garde le cookie sur une page QR (partagé avec les autres onglets en démo)', () => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        document.cookie = 'crf_demo_mode=1; path=/';
        vi.mocked(usePathname).mockReturnValue('/qr/abc');
        const { result } = renderHook(() => useDemoMode(), { wrapper: DemoProvider });
        expect(result.current.isDemoMode).toBe(false);
        expect(document.cookie).toContain('crf_demo_mode=1');
    });

    it('pose le cookie sur une page QR si la démo est active sans cookie', () => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        vi.mocked(usePathname).mockReturnValue('/qr/abc');
        renderHook(() => useDemoMode(), { wrapper: DemoProvider });
        expect(document.cookie).toContain('crf_demo_mode=1');
    });

    it('recharge quand un autre onglet bascule la démo', () => {
        renderHook(() => useDemoMode(), { wrapper: DemoProvider });
        act(() => { window.dispatchEvent(new StorageEvent('storage', { key: IS_DEMO_MODE_KEY })); });
        expect(window.location.reload).toHaveBeenCalled();
    });

    it('purge l\'ancienne base fictive au montage', () => {
        localStorage.setItem('crf_demo_db', '{}');
        renderHook(() => useDemoMode(), { wrapper: DemoProvider });
        expect(localStorage.getItem('crf_demo_db')).toBeNull();
    });

    describe('disponibilité (GET /api/demo/status)', () => {
        let fetchSpy: ReturnType<typeof vi.spyOn>;
        const respond = (body: unknown, status = 200) =>
            fetchSpy.mockResolvedValue(new Response(JSON.stringify(body), { status }));

        beforeEach(() => {
            fetchSpy = vi.spyOn(window, 'fetch');
        });
        afterEach(() => fetchSpy.mockRestore());

        it('expose isDemoAvailable = true quand la base démo est configurée', async () => {
            respond({ available: true });
            const { result } = renderHook(() => useDemoMode(), { wrapper: DemoProvider });
            expect(result.current.isDemoAvailable).toBe(false);
            await waitFor(() => expect(result.current.isDemoAvailable).toBe(true));
            expect(fetchSpy).toHaveBeenCalledWith('/api/demo/status');
        });

        it('quitte une démo active si la base démo n\'est plus configurée', async () => {
            localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
            document.cookie = 'crf_demo_mode=1; path=/';
            respond({ available: false });
            const { result } = renderHook(() => useDemoMode(), { wrapper: DemoProvider });
            await waitFor(() => expect(result.current.isDemoMode).toBe(false));
            expect(result.current.isDemoAvailable).toBe(false);
            expect(localStorage.getItem(IS_DEMO_MODE_KEY)).toBe('false');
            expect(document.cookie).not.toContain('crf_demo_mode=1');
        });

        it('garde la démo en cours si le statut est illisible (401)', async () => {
            localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
            respond({ error: 'Non authentifié' }, 401);
            const { result } = renderHook(() => useDemoMode(), { wrapper: DemoProvider });
            await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
            await Promise.resolve();
            expect(result.current.isDemoMode).toBe(true);
            expect(result.current.isDemoAvailable).toBe(false);
        });
    });

    it('lève une erreur si utilisé hors DemoProvider', () => {
        const { result } = renderHook(() => {
            try {
                return useDemoMode();
            } catch (e) {
                return e as Error;
            }
        });
        expect(result.current).toBeInstanceOf(Error);
        expect((result.current as Error).message).toContain('useDemoMode must be used within a DemoProvider');
    });
});
