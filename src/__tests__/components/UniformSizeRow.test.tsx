/**
 * Tests RTL — `UniformSizeRow` : quantité possédée et retrait d'une taille.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import UniformSizeRow from '@/components/uniforms/UniformSizeRow';

const SIZE = { id: 'polo-m', label: 'M', quantity: 3, available: 2 };

let fetchMock: ReturnType<typeof vi.fn>;

function respond(status: number, body: unknown = { success: true }) {
    fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    global.fetch = fetchMock as unknown as typeof fetch;
}

function renderRow() {
    const props = { itemId: 'polo', itemName: 'Polo', size: SIZE, onChanged: vi.fn(), onError: vi.fn() };
    render(<UniformSizeRow {...props} />);
    return props;
}

beforeEach(() => {
    respond(200);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('UniformSizeRow', () => {
    it('affiche le disponible ; « Enregistrer » n\'apparaît qu\'après modification', () => {
        renderRow();
        expect(screen.getByText('2 disponibles')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
        fireEvent.change(screen.getByLabelText('Quantité possédée Polo M'), { target: { value: '5' } });
        expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy();
    });

    it('enregistre la nouvelle quantité', async () => {
        const props = renderRow();
        fireEvent.change(screen.getByLabelText('Quantité possédée Polo M'), { target: { value: '5' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('/api/uniforms/items/polo/sizes/polo-m');
        expect(init.method).toBe('PATCH');
        expect(JSON.parse(String(init.body))).toEqual({ quantity: 5 });
    });

    it('retire la taille après confirmation', async () => {
        const props = renderRow();
        fireEvent.click(screen.getByRole('button', { name: 'Retirer la taille M de Polo' }));
        await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('/api/uniforms/items/polo/sizes/polo-m');
        expect(init.method).toBe('DELETE');
    });

    it('remonte le 409 (taille empruntée) au parent, sans recharger', async () => {
        respond(409, { error: 'Des pièces sont encore empruntées' });
        const props = renderRow();
        fireEvent.click(screen.getByRole('button', { name: 'Retirer la taille M de Polo' }));
        await waitFor(() => expect(props.onError).toHaveBeenCalledWith('Des pièces sont encore empruntées'));
        expect(props.onChanged).not.toHaveBeenCalled();
    });

    it('n\'envoie rien si la confirmation est refusée', () => {
        vi.mocked(window.confirm).mockReturnValue(false);
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: 'Retirer la taille M de Polo' }));
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
