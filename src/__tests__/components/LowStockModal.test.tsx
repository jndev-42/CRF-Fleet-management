import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LowStockModal from '@/components/inventory/modals/LowStockModal';

const items = [
    { id: 'i1', name: 'Gants', category: 'Protection', quantity: 2, minStock: 10 },
    { id: 'i2', name: 'Masques', category: null, quantity: 0, minStock: 5 },
];

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('LowStockModal', () => {
    it('affiche un état de chargement puis les articles en stock faible (happy path)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items }), { status: 200 }));
        render(<LowStockModal onClose={vi.fn()} onOpenBatches={vi.fn()} />);

        expect(screen.getByText('Chargement...')).toBeTruthy();
        expect(await screen.findByText('Gants')).toBeTruthy();
        expect(screen.getByText('-8')).toBeTruthy();
        expect(screen.getByText('-5')).toBeTruthy();
    });

    it('affiche un état vide si tous les stocks sont suffisants', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        render(<LowStockModal onClose={vi.fn()} onOpenBatches={vi.fn()} />);
        expect(await screen.findByText('Tous les stocks sont au-dessus du seuil minimum.')).toBeTruthy();
    });

    it('inclut le stockId dans l\'URL si fourni', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        render(<LowStockModal stockId="stock-1" onClose={vi.fn()} onOpenBatches={vi.fn()} />);

        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/inventory/low-stock?stockId=stock-1'));
    });

    it('ouvre le détail des lots au clic sur une ligne et ferme la modale', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items }), { status: 200 }));
        const onClose = vi.fn();
        const onOpenBatches = vi.fn();
        render(<LowStockModal onClose={onClose} onOpenBatches={onOpenBatches} />);

        fireEvent.click(await screen.findByText('Gants'));
        expect(onClose).toHaveBeenCalled();
        expect(onOpenBatches).toHaveBeenCalledWith('i1', 'Gants');
    });
});
