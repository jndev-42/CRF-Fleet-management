import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChecklistItems from '@/components/vehicle/ChecklistItems';
import type { ChecklistItemType } from '@/components/vehicle/ChecklistManager';

const items: ChecklistItemType[] = [
    { id: 'item-1', vehicleId: 'VL001', label: 'Vérifier les pneus', type: 'checkout', required: true, order: 0, createdAt: '2026-01-01' },
    { id: 'item-2', vehicleId: 'VL001', label: 'Vérifier le carburant', type: 'checkout', required: false, order: 1, createdAt: '2026-01-01' },
];

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ChecklistItems', () => {
    it('ne rend rien pendant le chargement', () => {
        vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => { /* jamais résolue */ }));
        const { container } = render(<ChecklistItems vehicleId="VL001" type="checkout" responses={{}} onChange={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('ne rend rien si aucun item n\'est configuré', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
        const { container } = render(<ChecklistItems vehicleId="VL001" type="checkout" responses={{}} onChange={vi.fn()} />);
        await waitFor(() => expect(container.firstChild).toBeNull());
    });

    it('affiche les items et initialise les réponses manquantes à false', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(items), { status: 200 }));
        const onChange = vi.fn();
        render(<ChecklistItems vehicleId="VL001" type="checkout" responses={{}} onChange={onChange} />);

        expect(await screen.findByText('Vérifier les pneus')).toBeTruthy();
        expect(screen.getByText('Vérifier le carburant')).toBeTruthy();
        await waitFor(() => expect(onChange).toHaveBeenCalledWith({ 'item-1': false, 'item-2': false }));
    });

    it('coche un item et appelle onChange avec la réponse mise à jour', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(items), { status: 200 }));
        const onChange = vi.fn();
        render(<ChecklistItems vehicleId="VL001" type="checkout" responses={{ 'item-1': false, 'item-2': false }} onChange={onChange} />);

        await screen.findByText('Vérifier les pneus');
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);

        expect(onChange).toHaveBeenCalledWith({ 'item-1': true, 'item-2': false });
    });

    it('marque les items requis avec un astérisque', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(items), { status: 200 }));
        render(<ChecklistItems vehicleId="VL001" type="checkout" responses={{}} onChange={vi.fn()} />);

        await screen.findByText('Vérifier les pneus');
        const checkboxes = screen.getAllByRole('checkbox');
        expect((checkboxes[0] as HTMLInputElement).required).toBe(true);
        expect((checkboxes[1] as HTMLInputElement).required).toBe(false);
    });

    it('ne casse pas le rendu si la requête échoue', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('error', { status: 500 }));
        const { container } = render(<ChecklistItems vehicleId="VL001" type="checkout" responses={{}} onChange={vi.fn()} />);
        await waitFor(() => expect(container.firstChild).toBeNull());
    });
});
