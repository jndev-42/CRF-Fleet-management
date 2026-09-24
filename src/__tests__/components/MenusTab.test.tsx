import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUseMenuSettings = vi.fn();
vi.mock('@/lib/contexts/MenuSettingsContext', async () => {
    const actual = await vi.importActual<typeof import('@/lib/contexts/MenuSettingsContext')>('@/lib/contexts/MenuSettingsContext');
    return { ...actual, useMenuSettings: () => mockUseMenuSettings() };
});

import MenusTab from '@/components/admin/MenusTab';

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MenusTab', () => {
    it('affiche toutes les sections, dont Frais et Uniformes', () => {
        mockUseMenuSettings.mockReturnValue({
            settings: [{ menu_key: 'stats', visibility: 'admin_only' }],
            refresh: vi.fn(),
        });
        render(<MenusTab />);

        expect(screen.getByText('Statistiques')).toBeTruthy();
        expect(screen.getByText('Inventaire')).toBeTruthy();
        expect(screen.getByText('Missions')).toBeTruthy();
        expect(screen.getByText('Frais')).toBeTruthy();
        expect(screen.getByText('Uniformes')).toBeTruthy();
    });

    it('propose l\'option « Super admin uniquement » et l\'envoie telle quelle', async () => {
        const refresh = vi.fn();
        mockUseMenuSettings.mockReturnValue({ settings: [], refresh });
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);

        render(<MenusTab />);
        const expensesSection = screen.getByText('Frais').parentElement?.parentElement as HTMLElement;
        fireEvent.click(within(expensesSection).getByText('Super admin uniquement'));

        await waitFor(() => expect(refresh).toHaveBeenCalled());
        expect(fetchMock).toHaveBeenCalledWith('/api/settings/menus/expenses', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ visibility: 'super_admin_only' }),
        }));
    });

    it('applique le paramètre "Activé" par défaut si non configuré', () => {
        mockUseMenuSettings.mockReturnValue({ settings: [], refresh: vi.fn() });
        render(<MenusTab />);
        expect(screen.getAllByText('Activé').length).toBeGreaterThan(0);
    });

    it('change la visibilité d\'un menu (happy path)', async () => {
        const refresh = vi.fn();
        mockUseMenuSettings.mockReturnValue({ settings: [], refresh });
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);

        render(<MenusTab />);
        const statsSection = screen.getByText('Statistiques').parentElement?.parentElement as HTMLElement;
        fireEvent.click(within(statsSection).getByText('Désactivé'));

        await waitFor(() => expect(refresh).toHaveBeenCalled());
        expect(fetchMock).toHaveBeenCalledWith('/api/settings/menus/stats', expect.objectContaining({ method: 'PATCH' }));
    });

    it('annule la mise à jour optimiste si la requête échoue', async () => {
        mockUseMenuSettings.mockReturnValue({ settings: [], refresh: vi.fn() });
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));

        render(<MenusTab />);
        const statsSection = screen.getByText('Statistiques').parentElement?.parentElement as HTMLElement;
        fireEvent.click(within(statsSection).getByText('Désactivé'));

        await waitFor(() => {
            expect(within(statsSection).getAllByText('Activé').length).toBeGreaterThan(0);
        });
    });
});
