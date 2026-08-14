import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EditItemModal from '@/components/inventory/modals/EditItemModal';

const mockItem = { id: 'item-1', name: 'Compresses', category: 'Pansements', notes: 'Stock UL', minStock: 10 };

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

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('EditItemModal', () => {
    it('ne rend rien si isOpen est false', () => {
        const { container } = render(<EditItemModal isOpen={false} item={mockItem} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('pré-remplit le formulaire avec les valeurs de l\'article', () => {
        render(<EditItemModal isOpen item={mockItem} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect(screen.getByDisplayValue('Compresses')).toBeTruthy();
        expect(screen.getByDisplayValue('Pansements')).toBeTruthy();
        expect(screen.getByDisplayValue('Stock UL')).toBeTruthy();
        expect(screen.getByDisplayValue('10')).toBeTruthy();
    });

    it('sélectionne une catégorie via les boutons rapides', () => {
        render(<EditItemModal isOpen item={mockItem} onClose={vi.fn()} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Médicament' }));
        expect(screen.getByDisplayValue('Médicament')).toBeTruthy();
    });

    it('soumet la modification (happy path)', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
        const onSuccess = vi.fn();
        render(<EditItemModal isOpen item={mockItem} onClose={vi.fn()} onSuccess={onSuccess} />);

        fireEvent.change(screen.getByDisplayValue('Compresses'), { target: { value: 'Compresses stériles' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const patchCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/inventory' && (c[1] as RequestInit)?.method === 'PATCH');
        expect(patchCall).toBeTruthy();
        const body = JSON.parse((patchCall![1] as RequestInit).body as string);
        expect(body.id).toBe('item-1');
        expect(body.name).toBe('Compresses stériles');
        expect(body.minStock).toBe(10);
    });

    it('envoie minStock=null si le champ est vidé', async () => {
        const fetchMock = mockFetch(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
        render(<EditItemModal isOpen item={mockItem} onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => {
            const patchCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'PATCH');
            const body = JSON.parse((patchCall![1] as RequestInit).body as string);
            expect(body.minStock).toBeNull();
        });
    });

    it('affiche une erreur si l\'API échoue', async () => {
        mockFetch(async () => new Response(JSON.stringify({ error: 'Nom déjà utilisé' }), { status: 400 }));
        render(<EditItemModal isOpen item={mockItem} onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        expect(await screen.findByText('Nom déjà utilisé')).toBeTruthy();
    });

    it('appelle onClose au clic sur Annuler', () => {
        const onClose = vi.fn();
        render(<EditItemModal isOpen item={mockItem} onClose={onClose} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onClose).toHaveBeenCalled();
    });
});
