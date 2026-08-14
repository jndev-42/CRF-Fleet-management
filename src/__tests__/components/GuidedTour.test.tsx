import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockPathname = '/vehicles';

vi.mock('next/navigation', () => ({
    usePathname: () => mockPathname,
}));

import GuidedTour from '@/components/GuidedTour';

beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    mockPathname = '/vehicles';
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
});
