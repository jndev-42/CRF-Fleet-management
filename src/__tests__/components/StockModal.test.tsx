import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StockModal from '@/components/inventory/modals/StockModal';

describe('StockModal', () => {
    it('ne rend rien si isOpen est false', () => {
        const { container } = render(<StockModal isOpen={false} mode="create" onClose={vi.fn()} onSubmit={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('affiche le titre "Créer" en mode création', () => {
        render(<StockModal isOpen mode="create" onClose={vi.fn()} onSubmit={vi.fn()} />);
        expect(screen.getByText('➕ Créer un nouveau stock')).toBeTruthy();
    });

    it('affiche le titre "Renommer" et pré-remplit le nom en mode renommage', () => {
        render(<StockModal isOpen mode="rename" initialName="Stock Principal" onClose={vi.fn()} onSubmit={vi.fn()} />);
        expect(screen.getByText('✏️ Renommer le stock')).toBeTruthy();
        expect((screen.getByPlaceholderText(/ex: Stock Véhicules/) as HTMLInputElement).value).toBe('Stock Principal');
    });

    it('crée le stock et ferme la modale (happy path)', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        const onClose = vi.fn();
        render(<StockModal isOpen mode="create" onClose={onClose} onSubmit={onSubmit} />);

        fireEvent.change(screen.getByPlaceholderText(/ex: Stock Véhicules/), { target: { value: 'Stock UL18' } });
        fireEvent.click(screen.getByRole('button', { name: 'Créer le stock' }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Stock UL18'));
        expect(onClose).toHaveBeenCalled();
    });

    it('affiche une erreur si onSubmit échoue', async () => {
        const onSubmit = vi.fn().mockRejectedValue(new Error('Nom déjà utilisé'));
        render(<StockModal isOpen mode="create" onClose={vi.fn()} onSubmit={onSubmit} />);

        fireEvent.change(screen.getByPlaceholderText(/ex: Stock Véhicules/), { target: { value: 'Stock UL18' } });
        fireEvent.click(screen.getByRole('button', { name: 'Créer le stock' }));

        expect(await screen.findByText('Nom déjà utilisé')).toBeTruthy();
    });

    it('réinitialise le formulaire à la réouverture', () => {
        const { rerender } = render(<StockModal isOpen={false} mode="rename" initialName="Ancien nom" onClose={vi.fn()} onSubmit={vi.fn()} />);
        rerender(<StockModal isOpen mode="rename" initialName="Ancien nom" onClose={vi.fn()} onSubmit={vi.fn()} />);
        expect((screen.getByPlaceholderText(/ex: Stock Véhicules/) as HTMLInputElement).value).toBe('Ancien nom');
    });
});
