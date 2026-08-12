import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/imageCompression', () => ({
    compressImage: vi.fn((f: File) => Promise.resolve(f)),
    compressImages: vi.fn((files: File[]) => Promise.resolve(files)),
    uploadFilesToDriveSafely: vi.fn().mockResolvedValue({ success: true, folderId: 'folder-1', fileIds: ['file-1'] }),
}));

import MissionWizard from '@/components/missions/MissionWizard';
import { uploadFilesToDriveSafely } from '@/lib/imageCompression';

const mockedUpload = vi.mocked(uploadFilesToDriveSafely);

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

function mockFetch(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

function fillStep1() {
    fireEvent.change(screen.getByLabelText('Nom de la mission *'), { target: { value: 'Poste Secours Test' } });
    fireEvent.change(screen.getByLabelText('Lieu *'), { target: { value: 'Local UL 18' } });
}

function goToLastStep() {
    fillStep1();
    // Général -> Équipage -> Matériel -> Oxygène -> Équipe -> Incidents -> Photos (7 étapes par défaut, RESEAU)
    for (let i = 0; i < 6; i++) {
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    }
}

beforeEach(() => {
    vi.restoreAllMocks();
    mockedUpload.mockResolvedValue({ success: true, folderId: 'folder-1', fileIds: ['file-1'] });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MissionWizard', () => {
    it('affiche la barre de progression avec les étapes par défaut (mission RESEAU)', () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        const items = screen.getAllByRole('listitem').map(el => el.textContent);
        expect(items).toContain('1. Général');
        expect(items).toContain('3. Matériel');
        expect(items).toContain('7. Photos');
        expect(items.some(t => t?.includes('Rapport signé'))).toBe(false);
    });

    it('bloque le passage à l\'étape suivante sans les champs requis', () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.getByRole('alert')).toHaveProperty('textContent', 'Le nom de la mission est requis.');
    });

    it('avance à l\'étape suivante une fois les champs requis remplis', () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        fillStep1();
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.getByRole('list', { name: 'Étapes du formulaire' })).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('revient à l\'étape précédente via "Précédent"', () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        fillStep1();
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.getByRole('button', { name: 'Précédent' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
        expect(screen.getByDisplayValue('Poste Secours Test')).toBeTruthy();
    });

    it('affiche "Rapport signé" comme étape supplémentaire pour une mission DPS', () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('radio', { name: 'DPS' }));
        const items = screen.getAllByRole('listitem').map(el => el.textContent);
        expect(items.some(t => t?.includes('Rapport signé'))).toBe(true);
    });

    it('soumet le compte rendu de mission (happy path)', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ id: 'mission-1' }), { status: 200 }));
        const onSuccess = vi.fn();

        render(<MissionWizard onSuccess={onSuccess} currentUserUlId="ul-lyon-3" />);
        goToLastStep();

        fireEvent.click(screen.getByRole('button', { name: 'Soumettre le compte rendu' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('mission-1'));

        const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/missions' && (c[1] as RequestInit)?.method === 'POST');
        expect(postCall).toBeTruthy();
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.mission_name).toBe('Poste Secours Test');
        expect(body.location).toBe('Local UL 18');
    });

    it('affiche l\'animation de succès au lieu d\'appeler onSuccess immédiatement pour l\'UL Paris 18', async () => {
        mockFetch(async () => new Response(JSON.stringify({ id: 'mission-1' }), { status: 200 }));
        const onSuccess = vi.fn();

        render(<MissionWizard onSuccess={onSuccess} currentUserUlId="ul-paris-18" />);
        goToLastStep();
        fireEvent.click(screen.getByRole('button', { name: 'Soumettre le compte rendu' }));

        await waitFor(() => expect(screen.getByAltText(/./)).toBeTruthy());
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('affiche une erreur si la soumission échoue', async () => {
        mockFetch(async () => new Response(JSON.stringify({ error: 'Véhicule déjà réservé' }), { status: 400 }));

        render(<MissionWizard onSuccess={vi.fn()} />);
        goToLastStep();
        fireEvent.click(screen.getByRole('button', { name: 'Soumettre le compte rendu' }));

        expect(await screen.findByText('Véhicule déjà réservé')).toBeTruthy();
    });

    it('bloque la soumission d\'un DPS sans rapport signé', () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('radio', { name: 'DPS' }));
        fillStep1();
        // Général -> Équipage -> Matériel -> Oxygène -> Équipe -> Incidents -> Rapport signé (8 étapes pour DPS)
        for (let i = 0; i < 6; i++) {
            fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        }
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.getByRole('alert')).toHaveProperty('textContent', 'Le rapport signé est obligatoire. Veuillez photographier ou importer le document.');
    });
});
