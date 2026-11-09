import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MissionPhotosModal from '@/components/missions/MissionPhotosModal';

const photos = [{ id: 'p1', name: 'photo1.jpg' }, { id: 'p2', name: 'photo2.jpg' }];

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MissionPhotosModal', () => {
    it('interroge le bon dossier Drive', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ photos: [] }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        render(<MissionPhotosModal folderId="folder-1" onClose={vi.fn()} />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/drive/photos?folderId=folder-1&flat=true'));
    });

    it('dossier R2 : interroge /api/media/photos et affiche les fichiers via /api/media/file', async () => {
        const ref = 'mission-com-photos/paris-18/maraude-20261108-143000-a1b2';
        const key = `${ref}/0a1b2c3d-photo.jpg`;
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ photos: [{ id: key, name: 'photo.jpg' }] }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        render(<MissionPhotosModal folderId={ref} onClose={vi.fn()} />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/media/photos?folderId=${encodeURIComponent(ref)}&flat=true`));
        const images = await screen.findAllByRole('img');
        expect((images[0] as HTMLImageElement).src).toContain(`/api/media/file?key=${encodeURIComponent(key)}`);
    });

    it('affiche les photos (happy path)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ photos }), { status: 200 }));
        render(<MissionPhotosModal folderId="folder-1" onClose={vi.fn()} />);

        const images = await screen.findAllByRole('img');
        expect(images).toHaveLength(2);
        expect(images[0]).toHaveProperty('alt', 'photo1.jpg');
    });

    it('affiche un état vide sans photo', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ photos: [] }), { status: 200 }));
        render(<MissionPhotosModal folderId="folder-1" onClose={vi.fn()} />);
        expect(await screen.findByText('Aucune photo disponible.')).toBeTruthy();
    });

    it('ne casse pas le rendu si la requête échoue', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
        render(<MissionPhotosModal folderId="folder-1" onClose={vi.fn()} />);
        expect(await screen.findByText('Aucune photo disponible.')).toBeTruthy();
    });
});
