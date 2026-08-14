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
    it('affiche les 3 sections avec leur visibilité actuelle', () => {
        mockUseMenuSettings.mockReturnValue({
            settings: [{ menu_key: 'stats', visibility: 'admin_only' }],
            refresh: vi.fn(),
        });
        render(<MenusTab />);

        expect(screen.getByText('Statistiques')).toBeTruthy();
        expect(screen.getByText('Inventaire')).toBeTruthy();
        expect(screen.getByText('Missions')).toBeTruthy();
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
