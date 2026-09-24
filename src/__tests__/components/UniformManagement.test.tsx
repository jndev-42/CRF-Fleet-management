/**
 * Tests RTL — onglet « Gestion » : `UniformManagement` (création d'article,
 * modale QR) et `UniformItemEditor` (renommer, retirer, ajouter une taille).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import UniformManagement from '@/components/uniforms/UniformManagement';
import UniformItemEditor from '@/components/uniforms/UniformItemEditor';

const POLO = { id: 'polo', name: 'Polo', sizes: [{ id: 'polo-m', label: 'M', quantity: 3, available: 2 }] };

let fetchMock: ReturnType<typeof vi.fn>;

function respond(status: number, body: unknown = { success: true }) {
    fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    global.fetch = fetchMock as unknown as typeof fetch;
}

function lastCall(): [string, RequestInit] {
    return fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown as [string, RequestInit];
}

beforeEach(() => {
    respond(200);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('UniformManagement', () => {
    function renderManagement(items = [POLO], onChanged = vi.fn()) {
        render(<UniformManagement items={items} ulId="ul-paris-18" ulName="Paris 18" canRegenerateQr onChanged={onChanged} />);
        return onChanged;
    }

    it('crée un article puis recharge le catalogue', async () => {
        respond(201, { success: true, id: 'new' });
        const onChanged = renderManagement([]);
        expect(screen.getByText(/Aucun article/)).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Nom du nouvel article'), { target: { value: '  Veste ' } });
        fireEvent.click(screen.getByRole('button', { name: /Créer l'article/ }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        const [url, init] = lastCall();
        expect(url).toBe('/api/uniforms/items');
        expect(init.method).toBe('POST');
        expect(JSON.parse(String(init.body))).toEqual({ name: 'Veste' });
    });

    it('affiche le 409 de création inline, sans recharger', async () => {
        respond(409, { error: 'Un article « Polo » existe déjà' });
        const onChanged = renderManagement();
        fireEvent.change(screen.getByLabelText('Nom du nouvel article'), { target: { value: 'Polo' } });
        fireEvent.click(screen.getByRole('button', { name: /Créer l'article/ }));

        expect((await screen.findByRole('alert')).textContent).toMatch(/existe déjà/);
        expect(onChanged).not.toHaveBeenCalled();
    });

    it('ouvre la modale QR Code Uniformes', async () => {
        respond(200, { token: 'tok-1' });
        renderManagement();
        fireEvent.click(screen.getByRole('button', { name: /QR Code Uniformes/ }));
        expect(await screen.findByText(/\/qr-uniforms\/tok-1/)).toBeTruthy();
    });
});

describe('UniformItemEditor', () => {
    it('renomme l\'article', async () => {
        const onChanged = vi.fn();
        render(<UniformItemEditor item={POLO} onChanged={onChanged} />);
        fireEvent.click(screen.getByRole('button', { name: 'Renommer Polo' }));
        fireEvent.change(screen.getByLabelText("Nom de l'article"), { target: { value: 'Polo ML' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        const [url, init] = lastCall();
        expect(url).toBe('/api/uniforms/items/polo');
        expect(init.method).toBe('PATCH');
        expect(JSON.parse(String(init.body))).toEqual({ name: 'Polo ML' });
    });

    it('retire l\'article après confirmation, rien si refusée', async () => {
        const onChanged = vi.fn();
        render(<UniformItemEditor item={POLO} onChanged={onChanged} />);

        vi.mocked(window.confirm).mockReturnValueOnce(false);
        fireEvent.click(screen.getByRole('button', { name: 'Retirer Polo' }));
        expect(fetchMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Retirer Polo' }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(lastCall()).toEqual(['/api/uniforms/items/polo', expect.objectContaining({ method: 'DELETE' })]);
    });

    it('affiche le 409 d\'archivage (pièces encore empruntées)', async () => {
        respond(409, { error: 'Des pièces sont encore empruntées : impossible de retirer tant qu\'elles ne sont pas rendues' });
        const onChanged = vi.fn();
        render(<UniformItemEditor item={POLO} onChanged={onChanged} />);
        fireEvent.click(screen.getByRole('button', { name: 'Retirer Polo' }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/encore empruntées/);
        expect(onChanged).not.toHaveBeenCalled();
    });

    it('ajoute une taille avec sa quantité', async () => {
        const onChanged = vi.fn();
        render(<UniformItemEditor item={POLO} onChanged={onChanged} />);
        fireEvent.change(screen.getByLabelText('Nouvelle taille pour Polo'), { target: { value: 'XL' } });
        fireEvent.change(screen.getByLabelText('Quantité de la nouvelle taille pour Polo'), { target: { value: '4' } });
        fireEvent.click(screen.getByRole('button', { name: /Ajouter la taille/ }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        const [url, init] = lastCall();
        expect(url).toBe('/api/uniforms/items/polo/sizes');
        expect(JSON.parse(String(init.body))).toEqual({ label: 'XL', quantity: 4 });
    });

    it('invite à ajouter une taille quand l\'article n\'en a aucune', () => {
        render(<UniformItemEditor item={{ ...POLO, sizes: [] }} onChanged={vi.fn()} />);
        expect(screen.getByText(/Aucune taille/)).toBeTruthy();
    });

    it('remonte la ligne de taille quand la quantité serveur change', () => {
        const { rerender } = render(<UniformItemEditor item={POLO} onChanged={vi.fn()} />);
        const input = screen.getByLabelText('Quantité possédée Polo M') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '9' } });
        rerender(<UniformItemEditor item={{ ...POLO, sizes: [{ ...POLO.sizes[0], quantity: 5 }] }} onChanged={vi.fn()} />);
        expect((screen.getByLabelText('Quantité possédée Polo M') as HTMLInputElement).value).toBe('5');
    });
});
