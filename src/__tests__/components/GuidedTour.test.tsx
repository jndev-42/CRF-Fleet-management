import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockPathname = '/vehicles';

vi.mock('next/navigation', () => ({
    usePathname: () => mockPathname,
}));

let mockVisibility: Record<string, string> = {};

vi.mock('@/lib/contexts/MenuSettingsContext', () => ({
    useMenuSettings: () => ({ getVisibility: (key: string) => mockVisibility[key] ?? 'available' }),
}));

import GuidedTour from '@/components/GuidedTour';

/** Parcourt tout le tour et renvoie les titres affichés. */
async function collectTitles(roles: string[]): Promise<string[]> {
    const { unmount } = render(<GuidedTour roles={roles} />);
    await screen.findByText('Bienvenue ! 👋', {}, { timeout: 2000 });
    const titles: string[] = [];
    const total = document.querySelectorAll('.tour-dot').length;
    for (let i = 0; i < total; i++) {
        titles.push(document.querySelector('.tour-info-title, .tour-tooltip-title')?.textContent ?? '');
        if (i < total - 1) fireEvent.click(screen.getByRole('button', { name: /Suivant/ }));
    }
    unmount();
    return titles;
}

beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    mockPathname = '/vehicles';
    mockVisibility = {};
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('GuidedTour', () => {
    it('ne démarre pas hors des pages dashboard/véhicules', async () => {
        mockPathname = '/missions';
        render(<GuidedTour roles={['CHVL']} />);
        await new Promise(r => setTimeout(r, 900));
        expect(screen.queryByText('Bienvenue ! 👋')).toBeNull();
    });

    it('ne redémarre pas si déjà terminé (localStorage)', async () => {
        localStorage.setItem('tour-completed', 'true');
        render(<GuidedTour roles={['CHVL']} />);
        await new Promise(r => setTimeout(r, 900));
        expect(screen.queryByText('Bienvenue ! 👋')).toBeNull();
    });

    it('démarre automatiquement sur la page véhicules pour un nouvel utilisateur', async () => {
        render(<GuidedTour roles={['CHVL']} />);
        expect(await screen.findByText('Bienvenue ! 👋', {}, { timeout: 2000 })).toBeTruthy();
    });

    it('avance à l\'étape suivante via "Suivant"', async () => {
        render(<GuidedTour roles={['CHVL']} />);
        await screen.findByText('Bienvenue ! 👋', {}, { timeout: 2000 });

        fireEvent.click(screen.getByRole('button', { name: /Suivant/ }));

        await waitFor(() => expect(screen.queryByText('Bienvenue ! 👋')).toBeNull());
    });

    it('revient à l\'étape précédente via "Précédent"', async () => {
        render(<GuidedTour roles={['CHVL']} />);
        await screen.findByText('Bienvenue ! 👋', {}, { timeout: 2000 });

        fireEvent.click(screen.getByRole('button', { name: /Suivant/ }));
        await waitFor(() => expect(screen.queryByText('Bienvenue ! 👋')).toBeNull());

        fireEvent.click(screen.getByRole('button', { name: /Précédent/ }));
        await waitFor(() => expect(screen.getByText('Bienvenue ! 👋')).toBeTruthy());
    });

    it('termine le tour via "Passer" et marque tour-completed en localStorage', async () => {
        render(<GuidedTour roles={['CHVL']} />);
        await screen.findByText('Bienvenue ! 👋', {}, { timeout: 2000 });

        fireEvent.click(screen.getByRole('button', { name: 'Passer' }));

        await waitFor(() => expect(screen.queryByText('Bienvenue ! 👋')).toBeNull());
        expect(localStorage.getItem('tour-completed')).toBe('true');
    });

    it('adapte le nombre d\'étapes selon les rôles (ADMIN voit plus d\'étapes qu\'un GUEST)', async () => {
        const { unmount } = render(<GuidedTour roles={[]} />);
        await screen.findByText('Bienvenue ! 👋', {}, { timeout: 2000 });
        const guestDots = document.querySelectorAll('.tour-dot').length;
        unmount();

        localStorage.clear();
        render(<GuidedTour roles={['ADMIN']} />);
        await screen.findByText('Bienvenue ! 👋', {}, { timeout: 2000 });
        const adminDots = document.querySelectorAll('.tour-dot').length;

        expect(adminDots).toBeGreaterThan(guestDots);
    });

    it('redémarre le tour sur l\'évènement "restart-tour"', async () => {
        render(<GuidedTour roles={['CHVL']} />);
        await screen.findByText('Bienvenue ! 👋', {}, { timeout: 2000 });
        fireEvent.click(screen.getByRole('button', { name: 'Passer' }));
        await waitFor(() => expect(screen.queryByText('Bienvenue ! 👋')).toBeNull());

        act(() => {
            window.dispatchEvent(new Event('restart-tour'));
        });

        expect(await screen.findByText('Bienvenue ! 👋')).toBeTruthy();
    });

    it('présente les notes de frais, les uniformes et la cloche à un bénévole actif', async () => {
        const titles = await collectTitles(['CHVL']);
        expect(titles).toEqual(expect.arrayContaining(['Notes de frais', 'Uniformes', 'Notifications', 'Page Statistiques']));
        expect(titles).not.toContain('Inventaire');
        expect(titles).not.toContain('Page Administration');
    });

    it('présente l\'inventaire au responsable inventaire, sans l\'administration', async () => {
        const titles = await collectTitles(['RESP_INVENTAIRE']);
        expect(titles).toContain('Inventaire');
        expect(titles).not.toContain('Page Administration');
    });

    it('présente l\'administration au cadre, sans la gestion des comptes', async () => {
        const titles = await collectTitles(['CADRE']);
        expect(titles).toContain('Page Administration');
        expect(titles).not.toContain('Gérer les utilisateurs');
    });

    it('n\'évoque pas un menu fermé dans les réglages', async () => {
        mockVisibility = { uniforms: 'disabled', expenses: 'admin_only' };
        const titles = await collectTitles(['CHVL']);
        expect(titles).not.toContain('Uniformes');
        expect(titles).not.toContain('Notes de frais');
    });

    it('masque l\'emprunt, les menus et la cloche pour un compte inactif', async () => {
        const titles = await collectTitles(['ADMIN', 'INACTIF']);
        expect(titles).not.toContain('Emprunter & Rendre un véhicule');
        expect(titles).not.toContain('Notes de frais');
        expect(titles).not.toContain('Notifications');
        expect(titles).not.toContain('Gérer les utilisateurs');
    });
});
