import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/contexts/ULContext', () => ({
    useUL: () => ({ activeUL: { id: 'ul-paris-18', name: 'Paris 18' } }),
}));

import AddVehicleModal from '@/components/vehicle/modals/AddVehicleModal';

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url.includes('/api/ul')) {
        return new Response(JSON.stringify({ uls: [{ id: 'ul-paris-18', defaultParkingSpots: ['Place A-1', 'Place A-2'] }] }), { status: 200 });
    }
    if (url.includes('/api/vehicles') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'VL999' }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
}

function mockFetch(handler = defaultFetchHandler) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

function fieldInput(labelText: string): HTMLInputElement {
    return screen.getByText(labelText).parentElement!.querySelector('input') as HTMLInputElement;
}

function fieldSelect(labelText: string): HTMLSelectElement {
    return screen.getByText(labelText).parentElement!.querySelector('select') as HTMLSelectElement;
}

function fillRequiredFields() {
    fireEvent.change(fieldInput('Nom du véhicule * (ex: VL186)'), { target: { value: 'VL999' } });
    fireEvent.change(fieldInput('Immatriculation *'), { target: { value: 'AB-123-CD' } });
    fireEvent.change(fieldInput('Date de 1ère immatriculation *'), { target: { value: '2022-01-15' } });
    fireEvent.change(fieldInput('Intervalle révision (km) *'), { target: { value: '15000' } });
    fireEvent.change(fieldInput('Intervalle révision (années) *'), { target: { value: '1' } });
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('AddVehicleModal', () => {
    it('ne rend rien si isOpen est false', () => {
        const { container } = render(<AddVehicleModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('pré-remplit l\'emplacement de stationnement avec le premier emplacement par défaut de l\'UL', async () => {
        mockFetch();
        render(<AddVehicleModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

        await waitFor(() => expect(fieldSelect('Lieu de stationnement habituel *').value).toBe('Place A-1'));
    });

    it('crée un véhicule (happy path)', async () => {
        const fetchMock = mockFetch();
        const onSuccess = vi.fn();
        render(<AddVehicleModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);

        await waitFor(() => expect(fieldSelect('Lieu de stationnement habituel *').value).toBe('Place A-1'));
        fillRequiredFields();
        fireEvent.click(screen.getByRole('button', { name: 'Créer le véhicule' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/vehicles' && (c[1] as RequestInit)?.method === 'POST');
        expect(postCall).toBeTruthy();
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.name).toBe('VL999');
        expect(body.plate).toBe('AB-123-CD');
        expect(body.parkingSpot).toBe('Place A-1');
    });

    it('utilise l\'emplacement personnalisé quand "Autre" est sélectionné', async () => {
        const fetchMock = mockFetch();
        render(<AddVehicleModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

        await waitFor(() => expect(fieldSelect('Lieu de stationnement habituel *').value).toBe('Place A-1'));
        fillRequiredFields();
        fireEvent.change(fieldSelect('Lieu de stationnement habituel *'), { target: { value: 'Autre' } });
        fireEvent.change(screen.getByPlaceholderText('Précisez la place...'), { target: { value: 'Garage souterrain' } });
        fireEvent.click(screen.getByRole('button', { name: 'Créer le véhicule' }));

        await waitFor(() => {
            const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST');
            const body = JSON.parse((postCall![1] as RequestInit).body as string);
            expect(body.parkingSpot).toBe('Garage souterrain');
        });
    });

    it('affiche une erreur si l\'API échoue', async () => {
        mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (url.includes('/api/vehicles') && init?.method === 'POST') {
                return new Response(JSON.stringify({ error: 'Immatriculation déjà utilisée' }), { status: 400 });
            }
            return defaultFetchHandler(input, init);
        });
        render(<AddVehicleModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

        await waitFor(() => expect(fieldSelect('Lieu de stationnement habituel *').value).toBe('Place A-1'));
        fillRequiredFields();
        fireEvent.click(screen.getByRole('button', { name: 'Créer le véhicule' }));

        await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Immatriculation déjà utilisée'));
    });

    it('envoie le guide PDF après la création, sous le nom du véhicule créé', async () => {
        const fetchMock = mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (url === '/api/vehicles' && init?.method === 'POST') {
                return new Response(JSON.stringify({ id: 'uuid', name: 'VL999' }), { status: 201 });
            }
            return defaultFetchHandler(input, init);
        });
        const onSuccess = vi.fn();
        render(<AddVehicleModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
        await waitFor(() => expect(fieldSelect('Lieu de stationnement habituel *').value).toBe('Place A-1'));
        fillRequiredFields();
        fireEvent.change(screen.getByLabelText('Guide de vérification (PDF, 4 Mo max) — Optionnel'), {
            target: { files: [new File(['%PDF-1.7'], 'VPSP 182.pdf', { type: 'application/pdf' })] },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Créer le véhicule' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const urls = fetchMock.mock.calls.filter(c => (c[1] as RequestInit)?.method === 'POST').map(c => getUrl(c[0]));
        expect(urls).toEqual(['/api/vehicles', '/api/vehicles/VL999/guide']);
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('conserve le véhicule créé si le guide est refusé, et le signale', async () => {
        mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (url.endsWith('/guide')) {
                return new Response(JSON.stringify({ error: 'Le fichier doit être un PDF.' }), { status: 400 });
            }
            return defaultFetchHandler(input, init);
        });
        const onSuccess = vi.fn();
        render(<AddVehicleModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
        await waitFor(() => expect(fieldSelect('Lieu de stationnement habituel *').value).toBe('Place A-1'));
        fillRequiredFields();
        fireEvent.change(screen.getByLabelText('Guide de vérification (PDF, 4 Mo max) — Optionnel'), {
            target: { files: [new File(['x'], 'faux.pdf', { type: 'application/pdf' })] },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Créer le véhicule' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Véhicule créé, guide non enregistré : Le fichier doit être un PDF.'));
    });

    it("n'envoie pas le guide d'une création précédente après fermeture puis réouverture", async () => {
        const fetchMock = mockFetch();
        const onSuccess = vi.fn();
        const { rerender } = render(<AddVehicleModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
        await waitFor(() => expect(fieldSelect('Lieu de stationnement habituel *').value).toBe('Place A-1'));
        fireEvent.change(screen.getByLabelText('Guide de vérification (PDF, 4 Mo max) — Optionnel'), {
            target: { files: [new File(['%PDF-1.7'], 'VPSP 182.pdf', { type: 'application/pdf' })] },
        });

        rerender(<AddVehicleModal isOpen={false} onClose={vi.fn()} onSuccess={onSuccess} />);
        rerender(<AddVehicleModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
        await waitFor(() => expect(screen.getByTestId('guide-status').textContent).toContain('Aucun guide joint'));

        fillRequiredFields();
        fireEvent.click(screen.getByRole('button', { name: 'Créer le véhicule' }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(fetchMock.mock.calls.some(c => getUrl(c[0]).endsWith('/guide'))).toBe(false);
    });

    it('appelle onClose au clic sur Annuler', async () => {
        mockFetch();
        const onClose = vi.fn();
        render(<AddVehicleModal isOpen onClose={onClose} onSuccess={vi.fn()} />);
        await waitFor(() => expect(fieldSelect('Lieu de stationnement habituel *').value).toBe('Place A-1'));

        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onClose).toHaveBeenCalled();
    });
});
