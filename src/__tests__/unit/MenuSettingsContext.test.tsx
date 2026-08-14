import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MenuSettingsProvider, useMenuSettings } from '@/lib/contexts/MenuSettingsContext';

describe('MenuSettingsContext', () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn();

    beforeEach(() => {
        mockFetch.mockReset();
        global.fetch = mockFetch as unknown as typeof fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('démarre en état loading avec available par défaut', () => {
        mockFetch.mockReturnValue(new Promise(() => { /* jamais résolue pendant ce test */ }));
        const { result } = renderHook(() => useMenuSettings(), { wrapper: MenuSettingsProvider });

        expect(result.current.loading).toBe(true);
        expect(result.current.getVisibility('stats')).toBe('available');
    });

    it('charge les réglages et applique la visibilité par clé (happy path)', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ settings: [{ menu_key: 'stats', visibility: 'admin_only' }] }),
        });

        const { result } = renderHook(() => useMenuSettings(), { wrapper: MenuSettingsProvider });

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.getVisibility('stats')).toBe('admin_only');
        expect(result.current.getVisibility('unknown_key')).toBe('available');
    });

    it('reste disponible par défaut si la requête échoue', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        const { result } = renderHook(() => useMenuSettings(), { wrapper: MenuSettingsProvider });

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.getVisibility('stats')).toBe('available');
    });

    it('retourne les valeurs par défaut hors de tout Provider', () => {
        const { result } = renderHook(() => useMenuSettings());
        expect(result.current.settings).toEqual([]);
        expect(result.current.getVisibility('stats')).toBe('available');
    });
});
