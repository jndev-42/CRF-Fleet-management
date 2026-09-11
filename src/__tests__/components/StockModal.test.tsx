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

        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Stock UL18', { copyStock: false }));
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

    describe('mode duplicate', () => {
        it('affiche le titre, le stock source et pré-remplit le nom', () => {
            render(
                <StockModal
                    isOpen
                    mode="duplicate"
                    initialName="Stock Principal (copie)"
                    sourceStockName="Stock Principal"
                    onClose={vi.fn()}
                    onSubmit={vi.fn()}
                />
            );
            expect(screen.getByText('⧉ Dupliquer le stock')).toBeTruthy();
            expect(screen.getByText(/Stock Principal/)).toBeTruthy();
            expect((screen.getByPlaceholderText(/ex: Stock Véhicules/) as HTMLInputElement).value)
                .toBe('Stock Principal (copie)');
        });

        it('laisse la case « Copier le stock actuel » décochée par défaut', () => {
            render(
                <StockModal isOpen mode="duplicate" sourceStockName="Stock Principal" onClose={vi.fn()} onSubmit={vi.fn()} />
            );
            expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
        });

        it('transmet copyStock=false quand la case reste décochée', async () => {
            const onSubmit = vi.fn().mockResolvedValue(undefined);
            render(
                <StockModal
                    isOpen
                    mode="duplicate"
                    initialName="Stock Principal (copie)"
                    sourceStockName="Stock Principal"
                    onClose={vi.fn()}
                    onSubmit={onSubmit}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));

            await waitFor(() =>
                expect(onSubmit).toHaveBeenCalledWith('Stock Principal (copie)', { copyStock: false })
            );
        });

        it('transmet copyStock=true quand la case est cochée', async () => {
            const onSubmit = vi.fn().mockResolvedValue(undefined);
            render(
                <StockModal
                    isOpen
                    mode="duplicate"
                    initialName="Stock Principal (copie)"
                    sourceStockName="Stock Principal"
                    onClose={vi.fn()}
                    onSubmit={onSubmit}
                />
            );

            fireEvent.click(screen.getByRole('checkbox'));
            fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));

            await waitFor(() =>
                expect(onSubmit).toHaveBeenCalledWith('Stock Principal (copie)', { copyStock: true })
            );
        });

        it('affiche l\'erreur serveur sans fermer la modale', async () => {
            const onSubmit = vi.fn().mockRejectedValue(new Error('Stock source introuvable'));
            const onClose = vi.fn();
            render(
                <StockModal
                    isOpen
                    mode="duplicate"
                    initialName="Copie"
                    sourceStockName="Stock Principal"
                    onClose={onClose}
                    onSubmit={onSubmit}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));

            await waitFor(() => expect(screen.getByText('Stock source introuvable')).toBeTruthy());
            expect(onClose).not.toHaveBeenCalled();
        });
    });
});
