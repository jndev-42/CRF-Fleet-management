import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DemoProvider, useDemoMode, IS_DEMO_MODE_KEY } from '@/lib/contexts/DemoContext';

describe('DemoContext', () => {
    const originalReload = window.location.reload;

    beforeEach(() => {
        localStorage.clear();
        Object.defineProperty(window, 'location', {
            value: { ...window.location, reload: vi.fn() },
            writable: true,
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', { value: { ...window.location, reload: originalReload }, writable: true });
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
