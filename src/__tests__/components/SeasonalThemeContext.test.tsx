import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SeasonalThemeProvider } from '@/lib/contexts/SeasonalThemeContext';
import SeasonalThemeToggle from '@/components/themes/SeasonalThemeToggle';

vi.mock('next-auth/react', () => ({
    useSession: vi.fn(),
}));

import { useSession } from 'next-auth/react';
const mockUseSession = vi.mocked(useSession);

const STORAGE_KEY = 'seasonal-theme-hidden:vendanges-montmartre:2026-10-07';

function mockActive(body: unknown, ok = true) {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok, json: async () => body } as Response);
}

function renderTree() {
    return render(
        <SeasonalThemeProvider>
            <SeasonalThemeToggle />
        </SeasonalThemeProvider>,
    );
}

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-season');
    mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } }, status: 'authenticated', update: vi.fn() } as never);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SeasonalThemeProvider + SeasonalThemeToggle', () => {
    it('pose data-season et affiche le bouton quand un thème est actif', async () => {
        mockActive({ theme: 'vendanges-montmartre', startDate: '2026-10-07' });
        renderTree();
        await waitFor(() => expect(document.documentElement.getAttribute('data-season')).toBe('vendanges-montmartre'));
        const btn = screen.getByRole('button', { name: 'Masquer le thème' });
        expect(btn.getAttribute('aria-pressed')).toBe('true');
    });

    it('sans thème actif : pas de bouton ni d\'attribut', async () => {
        mockActive({ theme: null, startDate: null });
        renderTree();
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(screen.queryByRole('button')).toBeNull();
        expect(document.documentElement.hasAttribute('data-season')).toBe(false);
    });

    it('masquer retire data-season, mémorise le choix, et le bouton reste visible', async () => {
        mockActive({ theme: 'vendanges-montmartre', startDate: '2026-10-07' });
        renderTree();
        fireEvent.click(await screen.findByRole('button', { name: 'Masquer le thème' }));
        expect(document.documentElement.hasAttribute('data-season')).toBe(false);
        expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
        const btn = screen.getByRole('button', { name: 'Afficher le thème' });
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(btn);
        expect(document.documentElement.getAttribute('data-season')).toBe('vendanges-montmartre');
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('un thème masqué le reste après rechargement', async () => {
        localStorage.setItem(STORAGE_KEY, '1');
        mockActive({ theme: 'vendanges-montmartre', startDate: '2026-10-07' });
        renderTree();
        expect(await screen.findByRole('button', { name: 'Afficher le thème' })).toBeTruthy();
        expect(document.documentElement.hasAttribute('data-season')).toBe(false);
    });

    it('une nouvelle plage réaffiche le thème', async () => {
        localStorage.setItem(STORAGE_KEY, '1');
        mockActive({ theme: 'vendanges-montmartre', startDate: '2027-10-06' });
        renderTree();
        await waitFor(() => expect(document.documentElement.getAttribute('data-season')).toBe('vendanges-montmartre'));
    });

    it('échec du fetch : silencieux, pas de déco', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('réseau'));
        renderTree();
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(screen.queryByRole('button')).toBeNull();
        expect(document.documentElement.hasAttribute('data-season')).toBe(false);
    });

    it('réponse en erreur : pas de déco', async () => {
        mockActive({ error: 'x' }, false);
        renderTree();
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('pas de fetch sans session authentifiée', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated', update: vi.fn() } as never);
        const spy = vi.spyOn(global, 'fetch');
        renderTree();
        expect(spy).not.toHaveBeenCalled();
        expect(document.documentElement.hasAttribute('data-season')).toBe(false);
    });

    it('retire data-season au démontage', async () => {
        mockActive({ theme: 'vendanges-montmartre', startDate: '2026-10-07' });
        const { unmount } = renderTree();
        await waitFor(() => expect(document.documentElement.hasAttribute('data-season')).toBe(true));
        unmount();
        expect(document.documentElement.hasAttribute('data-season')).toBe(false);
    });

    it('refetch au retour de focus et efface le thème quand la réponse n\'en a plus', async () => {
        const spy = vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce({ ok: true, json: async () => ({ theme: 'vendanges-montmartre', startDate: '2026-10-07' }) } as Response)
            .mockResolvedValue({ ok: true, json: async () => ({ theme: null, startDate: null }) } as Response);
        renderTree();
        await waitFor(() => expect(document.documentElement.hasAttribute('data-season')).toBe(true));

        fireEvent.focus(window);
        await waitFor(() => expect(document.documentElement.hasAttribute('data-season')).toBe(false));
        expect(spy).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('refetch quand l\'onglet redevient visible, et ignore l\'état caché', async () => {
        const spy = vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce({ ok: true, json: async () => ({ theme: null, startDate: null }) } as Response)
            .mockResolvedValue({ ok: true, json: async () => ({ theme: 'vendanges-montmartre', startDate: '2026-10-13' }) } as Response);
        renderTree();
        await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        expect(spy).toHaveBeenCalledTimes(1);

        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
        await waitFor(() => expect(document.documentElement.getAttribute('data-season')).toBe('vendanges-montmartre'));
        expect(spy).toHaveBeenCalledTimes(2);
    });
});
