import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InventoryHistoryModal from '@/components/inventory/modals/InventoryHistoryModal';

const logs = [
    { id: 'l1', itemId: 'i1', change: 5, userName: 'Jean Dupont', timestamp: '2026-01-15T10:00:00.000Z', note: 'Réassort' },
    { id: 'l2', itemId: 'i1', change: -2, userName: 'Marie Curie', timestamp: '2026-01-14T10:00:00.000Z', note: null },
];

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('InventoryHistoryModal', () => {
    it('interroge l\'historique du bon article', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ logs: [] }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        render(<InventoryHistoryModal itemId="i1" itemName="Compresses" onClose={vi.fn()} />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/inventory/history?itemId=i1'));
    });

    it('affiche l\'historique des mouvements (happy path)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ logs }), { status: 200 }));
        render(<InventoryHistoryModal itemId="i1" itemName="Compresses" onClose={vi.fn()} />);

        expect(screen.getByText('Historique : Compresses')).toBeTruthy();
        expect(await screen.findByText('+5')).toBeTruthy();
        expect(screen.getByText('-2')).toBeTruthy();
        expect(screen.getByText('Réassort')).toBeTruthy();
        expect(screen.getByText('—')).toBeTruthy();
    });

    it('affiche un état vide sans historique', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ logs: [] }), { status: 200 }));
        render(<InventoryHistoryModal itemId="i1" itemName="Compresses" onClose={vi.fn()} />);
        expect(await screen.findByText('Aucun historique pour cet article.')).toBeTruthy();
    });

    it('ne casse pas le rendu si la requête échoue', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('error', { status: 500 }));
        render(<InventoryHistoryModal itemId="i1" itemName="Compresses" onClose={vi.fn()} />);
        expect(await screen.findByText('Aucun historique pour cet article.')).toBeTruthy();
    });
});
