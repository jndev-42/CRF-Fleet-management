import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MaintenanceHistoryModal from '@/components/vehicle/modals/MaintenanceHistoryModal';
import type { Vehicle, MaintenanceRecord } from '@/app/vehicles/[id]/types';

const mockVehicle = { id: 'VL001', name: 'VL186' } as Vehicle;

const record1: MaintenanceRecord = { id: 'rec-1', vehicleId: 'VL001', date: '2026-01-15', type: 'CT', mileage: null, createdAt: '2026-01-15' };
const record2: MaintenanceRecord = { id: 'rec-2', vehicleId: 'VL001', date: '2025-06-01', type: 'REVISION', mileage: 45000, createdAt: '2025-06-01' };

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url.includes('/maintenance') && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ records: [record1, record2], total: 2, page: 1, totalPages: 1 }), { status: 200 });
    }
    if (url.includes('/maintenance') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes('/maintenance/') && init?.method === 'DELETE') {
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

describe('MaintenanceHistoryModal', () => {
    it('affiche l\'historique des entretiens', async () => {
        mockFetch();
        render(<MaintenanceHistoryModal vehicle={mockVehicle} isAdmin={false} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByText('Contrôle technique')).toBeTruthy();
        expect(screen.getByText('Révision')).toBeTruthy();
        expect(screen.getByText('45 000 km')).toBeTruthy();
    });

    it('affiche l\'état vide sans enregistrement', async () => {
        mockFetch(async () => new Response(JSON.stringify({ records: [], total: 0, page: 1, totalPages: 1 }), { status: 200 }));
        render(<MaintenanceHistoryModal vehicle={mockVehicle} isAdmin={false} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByText('Aucun enregistrement')).toBeTruthy();
    });

    it('masque le bouton d\'ajout et les actions pour un non-admin', async () => {
        mockFetch();
        render(<MaintenanceHistoryModal vehicle={mockVehicle} isAdmin={false} onClose={vi.fn()} onSuccess={vi.fn()} />);

        await screen.findByText('Contrôle technique');
        expect(screen.queryByRole('button', { name: '+ Ajouter' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Supprimer cet enregistrement' })).toBeNull();
    });

    it('ajoute un enregistrement (happy path, admin)', async () => {
        const fetchMock = mockFetch();
        const onSuccess = vi.fn();
        render(<MaintenanceHistoryModal vehicle={mockVehicle} isAdmin onClose={vi.fn()} onSuccess={onSuccess} />);

        await screen.findByText('Contrôle technique');
        fireEvent.click(screen.getByRole('button', { name: '+ Ajouter' }));

        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
        fireEvent.change(dateInput, { target: { value: '2026-03-01' } });
        fireEvent.click(screen.getByRole('button', { name: 'Valider' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST');
        expect(postCall).toBeTruthy();
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.date).toBe('2026-03-01');
        expect(body.type).toBe('CT');
    });

    it('affiche le champ kilométrage pour une révision', async () => {
        mockFetch();
        render(<MaintenanceHistoryModal vehicle={mockVehicle} isAdmin onClose={vi.fn()} onSuccess={vi.fn()} />);

        await screen.findByText('Contrôle technique');
        fireEvent.click(screen.getByRole('button', { name: '+ Ajouter' }));
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'REVISION' } });

        expect(screen.getByPlaceholderText('ex: 62000')).toBeTruthy();
    });

    it('supprime un enregistrement après confirmation', async () => {
        const fetchMock = mockFetch();
        const onSuccess = vi.fn();
        render(<MaintenanceHistoryModal vehicle={mockVehicle} isAdmin onClose={vi.fn()} onSuccess={onSuccess} />);

        await screen.findByText('Contrôle technique');
        fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer cet enregistrement' })[0]);

        expect(window.confirm).toHaveBeenCalled();
        await waitFor(() => {
            const deleteCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'DELETE');
            expect(deleteCall).toBeTruthy();
            expect(onSuccess).toHaveBeenCalled();
        });
    });

    it('affiche une erreur si le chargement échoue', async () => {
        mockFetch(async () => new Response(JSON.stringify({ error: 'Véhicule non trouvé' }), { status: 404 }));
        render(<MaintenanceHistoryModal vehicle={mockVehicle} isAdmin={false} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByText('Véhicule non trouvé')).toBeTruthy();
    });

    it('navigue entre les pages', async () => {
        mockFetch(async (input) => {
            const url = getUrl(input);
            const page = new URL(url, 'http://localhost').searchParams.get('page');
            return new Response(JSON.stringify({ records: [record1], total: 2, page: Number(page), totalPages: 2 }), { status: 200 });
        });

        render(<MaintenanceHistoryModal vehicle={mockVehicle} isAdmin={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
        await screen.findByText('Contrôle technique');

        expect(screen.getByText('1 / 2')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));

        await waitFor(() => expect(screen.getByText('2 / 2')).toBeTruthy());
    });
});
