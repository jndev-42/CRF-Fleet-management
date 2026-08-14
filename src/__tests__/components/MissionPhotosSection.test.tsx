import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MissionPhotosSection from '@/components/missions/MissionPhotosSection';

const photos = [{ id: 'p1', name: 'photo1.jpg' }];

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MissionPhotosSection', () => {
    it('interroge le bon dossier Drive', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ photos: [] }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        render(<MissionPhotosSection folderId="folder-1" />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/drive/photos?folderId=folder-1&flat=true'));
    });

    it('affiche les photos (happy path)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ photos }), { status: 200 }));
        render(<MissionPhotosSection folderId="folder-1" />);

        const images = await screen.findAllByRole('img');
        expect(images).toHaveLength(1);
    });

    it('affiche un état vide sans photo', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ photos: [] }), { status: 200 }));
        render(<MissionPhotosSection folderId="folder-1" />);
        expect(await screen.findByText('Aucune photo disponible.')).toBeTruthy();
    });

    it('ne casse pas le rendu si la requête échoue', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
        render(<MissionPhotosSection folderId="folder-1" />);
        expect(await screen.findByText('Aucune photo disponible.')).toBeTruthy();
    });
});
