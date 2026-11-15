import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LowStockModal from '@/components/inventory/modals/LowStockModal';

const items = [
    { id: 'i1', name: 'Gants', category: 'Protection', quantity: 2, minStock: 10, orderedAt: '2026-11-12 09:00:00' },
    { id: 'i2', name: 'Masques', category: null, quantity: 0, minStock: 5, orderedAt: null },
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

    it('utilise les variables de thème (pas de hex en dur) pour la couleur du déficit', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items }), { status: 200 }));
        render(<LowStockModal onClose={vi.fn()} onOpenBatches={vi.fn()} />);

        // jsdom ne résout pas var(--x, ...) sur .style.color (retombe sur une valeur
        // par défaut) — on vérifie donc l'attribut style brut, tel qu'écrit par React.
        // Gants : 2/10 = ratio 0.2 (< 0.5, > 0) → orange
        expect((await screen.findByText('-8')).getAttribute('style')).toContain('var(--status-inuse)');
        // Masques : 0/5 = ratio 0 (<= 0) → rouge
        expect(screen.getByText('-5').getAttribute('style')).toContain('var(--status-maintenance)');
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

    it('lecture seule : badge « Commandé » visible, aucun bouton', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items }), { status: 200 }));
        render(<LowStockModal onClose={vi.fn()} onOpenBatches={vi.fn()} />);

        expect(await screen.findByText(/Commandé le 12\/11/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Marquer commandé/ })).toBeNull();
    });

    it('gestionnaire : le bouton bascule via PATCH sans ouvrir les lots', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ items }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ orderedAt: '2026-11-15 08:00:00' }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        const onOpenBatches = vi.fn();
        render(<LowStockModal canManage onClose={vi.fn()} onOpenBatches={onOpenBatches} />);

        fireEvent.click(await screen.findByRole('button', { name: /Marquer commandé/ }));

        expect(await screen.findAllByText(/Commandé le/)).toHaveLength(2);
        expect(onOpenBatches).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenLastCalledWith('/api/inventory/low-stock', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ itemId: 'i2', ordered: true }),
        }));
    });

    it('annule la mise à jour et affiche l\'erreur si le PATCH échoue', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ items }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Article non trouvé' }), { status: 404 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<LowStockModal canManage onClose={vi.fn()} onOpenBatches={vi.fn()} />);

        fireEvent.click(await screen.findByRole('button', { name: /Marquer commandé/ }));

        expect(await screen.findByText('Article non trouvé')).toBeTruthy();
        expect(screen.getAllByText(/Commandé le/)).toHaveLength(1);
    });

    it('gestionnaire : retire le repère « commandé » via PATCH ordered:false', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ items }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ orderedAt: null }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        render(<LowStockModal canManage onClose={vi.fn()} onOpenBatches={vi.fn()} />);

        fireEvent.click(await screen.findByRole('button', { name: /Commandé le 12\/11/ }));

        await waitFor(() => expect(screen.queryByText(/Commandé le/)).toBeNull());
        expect(fetchMock).toHaveBeenLastCalledWith('/api/inventory/low-stock', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ itemId: 'i1', ordered: false }),
        }));
    });

    it('affiche le jour à l\'heure de Paris pour un horodatage UTC', async () => {
        const late = [{ ...items[0], orderedAt: '2026-11-11 23:30:00' }];
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: late }), { status: 200 }));
        render(<LowStockModal onClose={vi.fn()} onOpenBatches={vi.fn()} />);

        expect(await screen.findByText(/Commandé le 12\/11/)).toBeTruthy();
    });
});
