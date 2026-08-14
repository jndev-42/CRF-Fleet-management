import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ExpiringSoonModal from '@/components/inventory/modals/ExpiringSoonModal';

const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 5);
const pastDate = new Date();
pastDate.setDate(pastDate.getDate() - 5);

const items = [
    { batchId: 'b1', quantity: 3, expiryDate: futureDate.toISOString(), itemId: 'i1', itemName: 'Compresses', category: 'Pansements' },
    { batchId: 'b2', quantity: 1, expiryDate: pastDate.toISOString(), itemId: 'i2', itemName: 'Gants', category: null },
];

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ExpiringSoonModal', () => {
    it('affiche un état de chargement puis les articles (happy path)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items }), { status: 200 }));
        render(<ExpiringSoonModal onClose={vi.fn()} onOpenBatches={vi.fn()} />);

        expect(screen.getByText('Chargement...')).toBeTruthy();
        expect(await screen.findByText('Compresses')).toBeTruthy();
        expect(screen.getByText('Gants')).toBeTruthy();
    });

    it('affiche un état vide sans article', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        render(<ExpiringSoonModal onClose={vi.fn()} onOpenBatches={vi.fn()} />);
        expect(await screen.findByText('Aucun article ne périme bientôt.')).toBeTruthy();
    });

    it('marque les lots déjà périmés', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items }), { status: 200 }));
        render(<ExpiringSoonModal onClose={vi.fn()} onOpenBatches={vi.fn()} />);
        expect(await screen.findByText(/⚠️ PÉRIMÉ/)).toBeTruthy();
    });

    it('inclut le stockId dans l\'URL si fourni', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        render(<ExpiringSoonModal stockId="stock-1" onClose={vi.fn()} onOpenBatches={vi.fn()} />);

        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/inventory/expiring-soon?stockId=stock-1'));
    });

    it('ouvre le détail des lots au clic sur une ligne et ferme la modale', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items }), { status: 200 }));
        const onClose = vi.fn();
        const onOpenBatches = vi.fn();
        render(<ExpiringSoonModal onClose={onClose} onOpenBatches={onOpenBatches} />);

        fireEvent.click(await screen.findByText('Compresses'));
        expect(onClose).toHaveBeenCalled();
        expect(onOpenBatches).toHaveBeenCalledWith('i1', 'Compresses');
    });
});
