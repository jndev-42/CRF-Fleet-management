import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PhotoViewer from '@/components/PhotoViewer';

const photos = {
    emprunt: [{ id: 'p1', name: 'depart1.jpg' }],
    rendu: [{ id: 'p2', name: 'retour1.jpg' }],
};

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('PhotoViewer', () => {
    it('affiche les photos de départ et de retour (happy path)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(photos), { status: 200 }));
        render(<PhotoViewer driveFolderId="folder-1" onClose={vi.fn()} />);

        expect(await screen.findByText('Avant départ (1)')).toBeTruthy();
        expect(screen.getByText('Au retour (1)')).toBeTruthy();
    });

    it('affiche un état vide sans photo', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ emprunt: [], rendu: [] }), { status: 200 }));
        render(<PhotoViewer driveFolderId="folder-1" onClose={vi.fn()} />);
        expect(await screen.findByText('Aucune photo trouvée')).toBeTruthy();
    });

    it('affiche un message de permissions expirées pour un 403', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 403 }));
        render(<PhotoViewer driveFolderId="folder-1" onClose={vi.fn()} />);
        expect(await screen.findByText('Permissions expirées. Veuillez vous reconnecter.')).toBeTruthy();
    });

    it('affiche une erreur générique pour les autres échecs', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
        render(<PhotoViewer driveFolderId="folder-1" onClose={vi.fn()} />);
        expect(await screen.findByText('Erreur de téléchargement des photos')).toBeTruthy();
    });

    it('ouvre la vue plein écran au clic sur une photo et la ferme', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(photos), { status: 200 }));
        render(<PhotoViewer driveFolderId="folder-1" onClose={vi.fn()} />);

        await screen.findByText('Avant départ (1)');
        fireEvent.click(screen.getByAltText('depart1.jpg'));
        expect(screen.getByAltText('Vue en plein écran')).toBeTruthy();

        const closeButtons = screen.getAllByRole('button', { name: '✕' });
        fireEvent.click(closeButtons[closeButtons.length - 1]);
        expect(screen.queryByAltText('Vue en plein écran')).toBeNull();
    });

    it('appelle onClose au clic sur l\'overlay principal', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ emprunt: [], rendu: [] }), { status: 200 }));
        const onClose = vi.fn();
        const { container } = render(<PhotoViewer driveFolderId="folder-1" onClose={onClose} />);
        await screen.findByText('Aucune photo trouvée');

        fireEvent.click(container.querySelector('.modal-overlay') as Element);
        expect(onClose).toHaveBeenCalled();
    });
});
