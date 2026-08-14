import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({
    useSession: vi.fn(),
}));

import ItemBatchesModal from '@/components/inventory/modals/ItemBatchesModal';
import { useSession } from 'next-auth/react';

const mockUseSession = vi.mocked(useSession);

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

const batches = [
    { id: 'batch-nodate', quantity: 15, expiryDate: null },
    { id: 'batch-future', quantity: 5, expiryDate: '2027-01-01' },
    { id: 'batch-expired', quantity: 3, expiryDate: '2020-01-01' },
];

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url.includes('/api/inventory/batches') && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ batches }), { status: 200 });
    }
    if (url.includes('/api/inventory/batches') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ success: true, newBatchQuantity: 4 }), { status: 200 });
    }
    if (url.includes('/api/inventory/batches') && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes('/api/inventory/adjust') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
}

function mockFetch(handler = defaultFetchHandler) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

function mockSession(roles: string[]) {
    mockUseSession.mockReturnValue({ data: { user: { roles } }, status: 'authenticated', update: vi.fn() } as never);
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ItemBatchesModal', () => {
    it('affiche les lots avec leur date et quantité', async () => {
        mockSession(['CHVL']);
        mockFetch();
        render(<ItemBatchesModal itemId="item-1" itemName="Gants" onClose={vi.fn()} />);

        expect(await screen.findByText('2027/01/01')).toBeTruthy();
        expect(screen.getByText(/items sans date de péremption/).querySelector('strong')?.textContent).toBe('15');
    });

    it('signale les lots périmés', async () => {
        mockSession(['CHVL']);
        mockFetch();
        render(<ItemBatchesModal itemId="item-1" itemName="Gants" onClose={vi.fn()} />);

        expect(await screen.findByText(/2020\/01\/01.*Périmé/)).toBeTruthy();
    });

    it('masque les actions d\'ajustement pour un non-admin', async () => {
        mockSession(['CHVL']);
        mockFetch();
        render(<ItemBatchesModal itemId="item-1" itemName="Gants" onClose={vi.fn()} />);

        await screen.findByText('2027/01/01');
        expect(screen.queryByTitle('+1')).toBeNull();
        expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
    });

    it('ajuste la quantité d\'un lot pour un admin', async () => {
        mockSession(['ADMIN']);
        const fetchMock = mockFetch();
        render(<ItemBatchesModal itemId="item-1" itemName="Gants" onClose={vi.fn()} />);

        await screen.findByText('2027/01/01');
        fireEvent.click(screen.getAllByTitle('+1')[0]);

        await waitFor(() => {
            const patchCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'PATCH');
            expect(patchCall).toBeTruthy();
        });
    });

    it('supprime un lot périmé après confirmation (admin)', async () => {
        mockSession(['ADMIN']);
        const fetchMock = mockFetch();
        const onBatchDeleted = vi.fn();
        render(<ItemBatchesModal itemId="item-1" itemName="Gants" onClose={vi.fn()} onBatchDeleted={onBatchDeleted} />);

        await screen.findByText(/2020\/01\/01/);
        fireEvent.click(screen.getByRole('button', { name: /Supprimer/ }));

        expect(window.confirm).toHaveBeenCalled();
        await waitFor(() => {
            const deleteCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'DELETE');
            expect(deleteCall).toBeTruthy();
            expect(onBatchDeleted).toHaveBeenCalled();
        });
    });

    it('ajoute un nouveau lot (happy path)', async () => {
        mockSession(['ADMIN']);
        const fetchMock = mockFetch();
        render(<ItemBatchesModal itemId="item-1" itemName="Gants" onClose={vi.fn()} />);

        await screen.findByText('2027/01/01');
        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
        const qtyInput = document.querySelector('input[type="number"]') as HTMLInputElement;
        fireEvent.change(dateInput, { target: { value: '2027-06-01' } });
        fireEvent.change(qtyInput, { target: { value: '20' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => {
            const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]).includes('/api/inventory/adjust') && (c[1] as RequestInit)?.method === 'POST');
            expect(postCall).toBeTruthy();
            const body = JSON.parse((postCall![1] as RequestInit).body as string);
            expect(body.expiryDate).toBe('2027-06-01');
            expect(body.change).toBe(20);
        });
    });
});
