import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChecklistManager from '@/components/vehicle/ChecklistManager';

const checkoutItem = { id: 'item-1', vehicleId: 'VL001', label: 'Vérifier pneus', type: 'checkout' as const, required: false, order: 0, createdAt: '2026-01-01' };
const checkinItem = { id: 'item-2', vehicleId: 'VL001', label: 'Vérifier propreté', type: 'checkin' as const, required: true, order: 0, createdAt: '2026-01-01' };
const dsaItem = { id: 'dsa-VL001', vehicleId: 'VL001', label: 'DSA vérifié', type: 'checkout' as const, required: true, order: 1, createdAt: '2026-01-01' };

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url.includes('/checklist') && (!init || init.method === undefined)) {
        return new Response(JSON.stringify([checkoutItem, checkinItem, dsaItem]), { status: 200 });
    }
    if (url.includes('/api/vehicles/') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'item-3' }), { status: 200 });
    }
    if (url.includes('/api/checklist/') && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes('/api/checklist/') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
}

function mockFetch(handler = defaultFetchHandler) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ChecklistManager', () => {
    it('affiche les items de l\'onglet "Prise" par défaut', async () => {
        mockFetch();
        render(<ChecklistManager vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);

        expect(await screen.findByText('Vérifier pneus')).toBeTruthy();
        expect(screen.getByText('DSA vérifié')).toBeTruthy();
        expect(screen.queryByText('Vérifier propreté')).toBeNull();
    });

    it('bascule vers l\'onglet "Rendu"', async () => {
        mockFetch();
        render(<ChecklistManager vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);
        await screen.findByText('Vérifier pneus');

        fireEvent.click(screen.getByRole('button', { name: 'Rendu (Retour)' }));

        expect(await screen.findByText('Vérifier propreté')).toBeTruthy();
        expect(screen.queryByText('Vérifier pneus')).toBeNull();
    });

    it('affiche l\'état vide sans item', async () => {
        mockFetch(async () => new Response(JSON.stringify([]), { status: 200 }));
        render(<ChecklistManager vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);

        expect(await screen.findByText('Aucun item dans cette checklist.')).toBeTruthy();
    });

    it('désactive la case "Obligatoire" pour l\'item DSA système', async () => {
        mockFetch();
        render(<ChecklistManager vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);
        await screen.findByText('DSA vérifié');

        const checkboxes = screen.getAllByRole('checkbox', { name: 'Obligatoire' });
        const dsaCheckbox = checkboxes.find(cb => (cb as HTMLInputElement).disabled) as HTMLInputElement;
        expect(dsaCheckbox).toBeTruthy();
        expect(screen.queryByTitle("Supprimer l'item")).toBeTruthy();
    });

    it('ajoute un nouvel item (happy path)', async () => {
        const fetchMock = mockFetch();
        render(<ChecklistManager vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);
        await screen.findByText('Vérifier pneus');

        fireEvent.change(screen.getByPlaceholderText('Libellé de la vérification...'), { target: { value: 'Vérifier essuie-glaces' } });
        fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

        await waitFor(() => {
            const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST');
            expect(postCall).toBeTruthy();
            const body = JSON.parse((postCall![1] as RequestInit).body as string);
            expect(body.label).toBe('Vérifier essuie-glaces');
            expect(body.type).toBe('checkout');
        });
    });

    it('bascule le caractère obligatoire d\'un item (optimiste)', async () => {
        const fetchMock = mockFetch();
        render(<ChecklistManager vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);
        await screen.findByText('Vérifier pneus');

        const checkboxes = screen.getAllByRole('checkbox', { name: 'Obligatoire' });
        const pneusCheckbox = checkboxes.find(cb => !(cb as HTMLInputElement).disabled) as HTMLInputElement;
        expect(pneusCheckbox.checked).toBe(false);
        fireEvent.click(pneusCheckbox);
        expect(pneusCheckbox.checked).toBe(true);

        await waitFor(() => {
            const patchCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'PATCH');
            expect(patchCall).toBeTruthy();
        });
    });

    it('supprime un item après confirmation', async () => {
        const fetchMock = mockFetch();
        render(<ChecklistManager vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);
        await screen.findByText('Vérifier pneus');

        fireEvent.click(screen.getByTitle("Supprimer l'item"));

        expect(window.confirm).toHaveBeenCalled();
        await waitFor(() => {
            const deleteCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'DELETE');
            expect(deleteCall).toBeTruthy();
            expect(screen.queryByText('Vérifier pneus')).toBeNull();
        });
    });
});
