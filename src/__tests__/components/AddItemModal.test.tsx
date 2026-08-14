import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AddItemModal from '@/components/inventory/modals/AddItemModal';

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('AddItemModal', () => {
    it('ne rend rien si isOpen est false', () => {
        const { container } = render(<AddItemModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('sélectionne une catégorie prédéfinie au clic', () => {
        render(<AddItemModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Médicament' }));
        expect((screen.getByPlaceholderText('Ou saisir une catégorie personnalisée...') as HTMLInputElement).value).toBe('Médicament');
    });

    it('crée un article et appelle onSuccess/onClose (happy path)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        const onSuccess = vi.fn();
        const onClose = vi.fn();

        render(<AddItemModal isOpen stockId="stock-1" onClose={onClose} onSuccess={onSuccess} />);

        fireEvent.change(screen.getByPlaceholderText('ex: Pansements stériles'), { target: { value: 'Gants' } });
        fireEvent.click(screen.getByRole('button', { name: 'Créer l\'article' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(onClose).toHaveBeenCalled();

        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.name).toBe('Gants');
        expect(body.stockId).toBe('stock-1');
    });

    it('affiche une erreur serveur sans fermer la modale', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Nom déjà utilisé' }), { status: 400 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        const onClose = vi.fn();

        render(<AddItemModal isOpen onClose={onClose} onSuccess={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('ex: Pansements stériles'), { target: { value: 'Gants' } });
        fireEvent.click(screen.getByRole('button', { name: 'Créer l\'article' }));

        expect(await screen.findByText('Nom déjà utilisé')).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('désactive le champ date de péremption tant que la quantité est à 0', () => {
        render(<AddItemModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
        expect(dateInput.disabled).toBe(true);

        const qtyInput = document.querySelector('input[type="number"]') as HTMLInputElement;
        fireEvent.change(qtyInput, { target: { value: '5' } });
        expect(dateInput.disabled).toBe(false);
    });

    it('appelle onClose au clic sur le bouton Annuler', () => {
        const onClose = vi.fn();
        render(<AddItemModal isOpen onClose={onClose} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onClose).toHaveBeenCalled();
    });
});
