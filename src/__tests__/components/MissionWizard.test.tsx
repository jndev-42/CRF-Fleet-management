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

/** Liste UL renvoyée par GET /api/ul — porte deux DT distinctes pour vérifier la
 *  dérivation des entrées DT synthétiques de l'étape 1. */
const UL_FIXTURE = {
    uls: [
        { id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18', dtCode: 'DT 75' },
        { id: 'ul-lyon-3', name: 'Lyon 3', slug: 'lyon-3', dtCode: 'DT 69' },
    ],
};

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

/** Installe le mock fetch. `/api/ul` est toujours servi (l'étape 1 le charge au
 *  montage) ; le handler optionnel prend en charge le reste. */
function mockFetch(handler?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
    const mock = vi.fn().mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
        if (getUrl(input) === '/api/ul') {
            return new Response(JSON.stringify(UL_FIXTURE), { status: 200 });
        }
        if (handler) return handler(input, init);
        return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

async function chooseAttachment(value = 'ul:ul-lyon-3') {
    const select = await screen.findByLabelText('Structure de rattachement *') as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
    fireEvent.change(select, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
}

function fillStep1() {
    fireEvent.change(screen.getByLabelText('Nom de la mission *'), { target: { value: 'Poste Secours Test' } });
    fireEvent.change(screen.getByLabelText('Lieu *'), { target: { value: 'Local UL 18' } });
}

async function goToLastStep(attachment?: string) {
    await chooseAttachment(attachment);
    fillStep1();
    // Général -> Équipage -> Matériel -> Oxygène -> Équipe -> Incidents -> Commentaire -> Photos
    for (let i = 0; i < 7; i++) {
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    }
}

beforeEach(() => {
    vi.restoreAllMocks();
    mockedUpload.mockResolvedValue({ success: true, folderId: 'folder-1', fileIds: ['file-1'] });
    mockFetch();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MissionWizard', () => {
    it('affiche la barre de progression avec les étapes par défaut (mission RESEAU)', () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        const items = screen.getAllByRole('listitem').map(el => el.textContent);
        expect(items).toContain('1. UL / DT');
        expect(items).toContain('2. Général');
        expect(items).toContain('4. Matériel');
        expect(items).toContain('8. Commentaire');
        expect(items).toContain('9. Photos');
        expect(items.some(t => t?.includes('Rapport signé'))).toBe(false);
    });

    it('bloque le passage à l\'étape suivante sans UL ni DT sélectionnée', () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.getByRole('alert')).toHaveProperty(
            'textContent',
            'Veuillez sélectionner l\'UL ou la Direction Territoriale qui héberge le poste.',
        );
    });

    it('propose les UL et les entrées DT dérivées des dtCode distincts', async () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        const select = await screen.findByLabelText('Structure de rattachement *') as HTMLSelectElement;
        await waitFor(() => expect(select.options.length).toBeGreaterThan(1));

        const values = Array.from(select.options).map(o => o.value);
        expect(values).toContain('ul:ul-paris-18');
        expect(values).toContain('ul:ul-lyon-3');
        expect(values).toContain('dt:DT 75');
        expect(values).toContain('dt:DT 69');
    });

    it('bloque le passage à l\'étape suivante sans les champs requis', async () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        await chooseAttachment();
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.getByRole('alert')).toHaveProperty('textContent', 'Le nom de la mission est requis.');
    });

    it('avance à l\'étape suivante une fois les champs requis remplis', async () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        await chooseAttachment();
        fillStep1();
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.getByRole('list', { name: 'Étapes du formulaire' })).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('revient à l\'étape précédente via "Précédent"', async () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        await chooseAttachment();
        fillStep1();
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.getByRole('button', { name: 'Précédent' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
        expect(screen.getByDisplayValue('Poste Secours Test')).toBeTruthy();
    });

    it('affiche "Rapport signé" comme étape supplémentaire pour une mission DPS', async () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        await chooseAttachment();
        fireEvent.click(screen.getByRole('radio', { name: 'DPS' }));
        const items = screen.getAllByRole('listitem').map(el => el.textContent);
        expect(items.some(t => t?.includes('Rapport signé'))).toBe(true);
    });

    it('soumet le compte rendu de mission (happy path) avec l\'UL choisie', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ id: 'mission-1' }), { status: 200 }));
        const onSuccess = vi.fn();

        render(<MissionWizard onSuccess={onSuccess} />);
        await goToLastStep();

        fireEvent.click(screen.getByRole('button', { name: 'Soumettre le compte rendu' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('mission-1'));

        const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/missions' && (c[1] as RequestInit)?.method === 'POST');
        expect(postCall).toBeTruthy();
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.mission_name).toBe('Poste Secours Test');
        expect(body.location).toBe('Local UL 18');
        expect(body.selected_ul_id).toBe('ul-lyon-3');
        expect(body.selected_dt_code).toBeNull();
    });

    it('soumet un rattachement DT sans UL quand une entrée DT est choisie', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ id: 'mission-dt' }), { status: 200 }));
        const onSuccess = vi.fn();

        render(<MissionWizard onSuccess={onSuccess} />);
        await goToLastStep('dt:DT 75');

        fireEvent.click(screen.getByRole('button', { name: 'Soumettre le compte rendu' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('mission-dt'));

        const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/missions' && (c[1] as RequestInit)?.method === 'POST');
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.selected_ul_id).toBeNull();
        expect(body.selected_dt_code).toBe('DT 75');
    });

    it('affiche l\'étape Commentaire juste avant Photos et inclut la saisie dans la soumission', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ id: 'mission-1' }), { status: 200 }));
        const onSuccess = vi.fn();

        render(<MissionWizard onSuccess={onSuccess} />);
        await chooseAttachment();
        fillStep1();
        // Général -> Équipage -> Matériel -> Oxygène -> Équipe -> Incidents -> Commentaire (6 clics)
        for (let i = 0; i < 6; i++) {
            fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        }
        expect(screen.getByText('Commentaire libre')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Commentaire'), { target: { value: 'RAS, mission calme.' } });
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        fireEvent.click(screen.getByRole('button', { name: 'Soumettre le compte rendu' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('mission-1'));

        const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/missions' && (c[1] as RequestInit)?.method === 'POST');
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.mission_comment).toBe('RAS, mission calme.');
    });

    it('affiche l\'animation de succès quand le POSTE choisi est l\'UL Paris 18', async () => {
        mockFetch(async () => new Response(JSON.stringify({ id: 'mission-1' }), { status: 200 }));
        const onSuccess = vi.fn();

        render(<MissionWizard onSuccess={onSuccess} />);
        await goToLastStep('ul:ul-paris-18');
        fireEvent.click(screen.getByRole('button', { name: 'Soumettre le compte rendu' }));

        await waitFor(() => expect(screen.getByAltText(/./)).toBeTruthy());
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('affiche une erreur si la soumission échoue', async () => {
        mockFetch(async () => new Response(JSON.stringify({ error: 'Véhicule déjà réservé' }), { status: 400 }));

        render(<MissionWizard onSuccess={vi.fn()} />);
        await goToLastStep();
        fireEvent.click(screen.getByRole('button', { name: 'Soumettre le compte rendu' }));

        expect(await screen.findByText('Véhicule déjà réservé')).toBeTruthy();
    });

    it('bloque la soumission d\'un DPS sans rapport signé', async () => {
        render(<MissionWizard onSuccess={vi.fn()} />);
        await chooseAttachment();
        fireEvent.click(screen.getByRole('radio', { name: 'DPS' }));
        fillStep1();
        // Général -> Équipage -> Matériel -> Oxygène -> Équipe -> Incidents -> Rapport signé
        for (let i = 0; i < 6; i++) {
            fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        }
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.getByRole('alert')).toHaveProperty('textContent', 'Le rapport signé est obligatoire. Veuillez photographier ou importer le document.');
    });
});
