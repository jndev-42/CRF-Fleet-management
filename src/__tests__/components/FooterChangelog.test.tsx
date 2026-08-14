import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import FooterChangelog from '@/components/FooterChangelog';

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('FooterChangelog', () => {
    it('affiche le numéro de version en bouton', () => {
        render(<FooterChangelog />);
        expect(screen.getByRole('button').textContent).toContain('v');
    });

    it('ouvre la modale et charge le changelog au clic (happy path)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('# Changelog\n\n## [1.0.0]\nPremière version.', { status: 200 }));
        render(<FooterChangelog />);

        fireEvent.click(screen.getByRole('button'));
        expect(await screen.findByText('📝 Notes de mise à jour (Changelog)')).toBeTruthy();
        await waitFor(() => expect(screen.getByText(/Première version/)).toBeTruthy());
    });

    it('affiche une erreur si le chargement échoue', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
        render(<FooterChangelog />);

        fireEvent.click(screen.getByRole('button'));
        expect(await screen.findByText('Impossible de charger le changelog.')).toBeTruthy();
    });

    it('ferme la modale au clic sur le bouton de fermeture', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('# Test', { status: 200 }));
        render(<FooterChangelog />);

        fireEvent.click(screen.getByRole('button'));
        await screen.findByText('📝 Notes de mise à jour (Changelog)');
        fireEvent.click(screen.getByText('✕'));

        expect(screen.queryByText('📝 Notes de mise à jour (Changelog)')).toBeNull();
    });

    it('ne relance pas la requête si le contenu est déjà chargé', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('# Test', { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        render(<FooterChangelog />);

        fireEvent.click(screen.getByRole('button'));
        await screen.findByText('📝 Notes de mise à jour (Changelog)');
        fireEvent.click(screen.getByText('✕'));
        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    });
});
