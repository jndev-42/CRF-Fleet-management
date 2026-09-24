/**
 * Tests RTL — `UniformCatalog` (catalogue + panier), partagé appli / QR.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import UniformCatalog from '@/components/uniforms/UniformCatalog';
import { UNIFORMS_CHANGED_EVENT } from '@/components/uniforms/events';

const ITEMS = [
    {
        id: 'polo',
        name: 'Polo',
        sizes: [
            { id: 'polo-m', label: 'M', quantity: 3, available: 2 },
            { id: 'polo-l', label: 'L', quantity: 2, available: 0 },
        ],
    },
    // Sans taille : jamais affiché à l'emprunt.
    { id: 'vide', name: 'Casquette', sizes: [] },
];

function mockFetch(status: number, body: unknown) {
    const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    global.fetch = fn as unknown as typeof fetch;
    return fn;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('UniformCatalog', () => {
    it('affiche le disponible par taille et masque les articles sans taille', () => {
        render(<UniformCatalog items={ITEMS} submitUrl="/api/uniforms/loans" onSubmitted={vi.fn()} />);
        expect(screen.getByText('Polo')).toBeTruthy();
        expect(screen.getByText('2 disponibles')).toBeTruthy();
        expect(screen.getByText('0 disponible')).toBeTruthy();
        expect(screen.queryByText('Casquette')).toBeNull();
    });

    it('borne le panier au disponible', () => {
        render(<UniformCatalog items={ITEMS} submitUrl="/api/uniforms/loans" onSubmitted={vi.fn()} />);
        const addM = screen.getByRole('button', { name: 'Ajouter un Polo M au panier' });
        fireEvent.click(addM);
        fireEvent.click(addM);
        expect((addM as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Ajouter un Polo L au panier' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText('Polo M × 2')).toBeTruthy();
        expect(screen.getByText('Panier (2 pièces)')).toBeTruthy();
    });

    it('poste le panier projeté, vide le panier et notifie la card des emprunts', async () => {
        const fetchMock = mockFetch(201, { success: true, batchId: 'b1', count: 2 });
        const onSubmitted = vi.fn();
        const listener = vi.fn();
        window.addEventListener(UNIFORMS_CHANGED_EVENT, listener);

        render(<UniformCatalog items={ITEMS} submitUrl="/api/qr-uniforms/tok/loans" onSubmitted={onSubmitted} />);
        const addM = screen.getByRole('button', { name: 'Ajouter un Polo M au panier' });
        fireEvent.click(addM);
        fireEvent.click(addM);
        fireEvent.click(screen.getByRole('button', { name: 'Valider l\'emprunt' }));

        await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('/api/qr-uniforms/tok/loans');
        expect(JSON.parse(String(init.body))).toEqual({ lines: [{ sizeId: 'polo-m', quantity: 2 }] });
        expect(listener).toHaveBeenCalled();
        expect(screen.queryByText(/Panier/)).toBeNull();
        expect(screen.getByRole('status').textContent).toMatch(/2 pièces empruntées/);

        window.removeEventListener(UNIFORMS_CHANGED_EVENT, listener);
    });

    it('affiche le 409 inline, garde le panier et recharge le catalogue', async () => {
        mockFetch(409, { error: 'Plus assez de « Polo M » disponibles (1 restant)' });
        const onSubmitted = vi.fn();
        render(<UniformCatalog items={ITEMS} submitUrl="/api/uniforms/loans" onSubmitted={onSubmitted} />);
        fireEvent.click(screen.getByRole('button', { name: 'Ajouter un Polo M au panier' }));
        fireEvent.click(screen.getByRole('button', { name: 'Valider l\'emprunt' }));

        expect((await screen.findByRole('alert')).textContent).toMatch(/Plus assez/);
        expect(screen.getByText('Polo M × 1')).toBeTruthy();
        expect(onSubmitted).toHaveBeenCalled();
    });

    it('après un 409, le panier est borné au disponible rechargé', async () => {
        const fetchMock = mockFetch(201, { success: true });
        const { rerender } = render(<UniformCatalog items={ITEMS} submitUrl="/api/uniforms/loans" onSubmitted={vi.fn()} />);
        const addM = screen.getByRole('button', { name: 'Ajouter un Polo M au panier' });
        fireEvent.click(addM);
        fireEvent.click(addM);

        // Le catalogue rechargé ne montre plus qu'une pièce disponible.
        const reduced = [{ ...ITEMS[0], sizes: [{ ...ITEMS[0].sizes[0], available: 1 }, ITEMS[0].sizes[1]] }];
        rerender(<UniformCatalog items={reduced} submitUrl="/api/uniforms/loans" onSubmitted={vi.fn()} />);
        expect(screen.getByText('Polo M × 1')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Valider l\'emprunt' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(JSON.parse(String(init.body))).toEqual({ lines: [{ sizeId: 'polo-m', quantity: 1 }] });
    });

    it('une taille tombée à 0 disparaît du panier', () => {
        const { rerender } = render(<UniformCatalog items={ITEMS} submitUrl="/api/uniforms/loans" onSubmitted={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Ajouter un Polo M au panier' }));
        const none = [{ ...ITEMS[0], sizes: [{ ...ITEMS[0].sizes[0], available: 0 }, ITEMS[0].sizes[1]] }];
        rerender(<UniformCatalog items={none} submitUrl="/api/uniforms/loans" onSubmitted={vi.fn()} />);
        expect(screen.queryByText(/Panier/)).toBeNull();
    });

    it('retire une ligne du panier', () => {
        render(<UniformCatalog items={ITEMS} submitUrl="/api/uniforms/loans" onSubmitted={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Ajouter un Polo M au panier' }));
        fireEvent.click(screen.getByRole('button', { name: 'Retirer Polo M du panier' }));
        expect(screen.queryByText(/Panier/)).toBeNull();
    });

    it('état vide', () => {
        render(<UniformCatalog items={[]} submitUrl="/api/uniforms/loans" onSubmitted={vi.fn()} />);
        expect(screen.getByText(/Aucun article d'uniforme disponible/)).toBeTruthy();
    });
});
