/**
 * Tests RTL — `ReturnUniformModal` : état propre/sale obligatoire, commentaire
 * facultatif, erreurs inline.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ReturnUniformModal from '@/components/uniforms/ReturnUniformModal';
import { UNIFORMS_CHANGED_EVENT } from '@/components/uniforms/events';

function mockFetch(status: number, body: unknown) {
    const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    global.fetch = fn as unknown as typeof fetch;
    return fn;
}

afterEach(() => {
    vi.restoreAllMocks();
});

function renderModal(overrides: Partial<React.ComponentProps<typeof ReturnUniformModal>> = {}) {
    const props = {
        subject: 'Polo M',
        url: '/api/uniforms/loans/l1/return',
        onClose: vi.fn(),
        onReturned: vi.fn(),
        ...overrides,
    };
    render(<ReturnUniformModal {...props} />);
    return props;
}

describe('ReturnUniformModal', () => {
    it('le bouton reste inactif tant que l\'état n\'est pas choisi', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: 'Rendre Polo M' })).toBeTruthy();
        const submit = screen.getByRole('button', { name: 'Confirmer le rendu' }) as HTMLButtonElement;
        expect(submit.disabled).toBe(true);
        fireEvent.click(screen.getByLabelText(/Propre/));
        expect(submit.disabled).toBe(false);
    });

    it('poste returnedClean=false et le commentaire, puis appelle onReturned', async () => {
        const fetchMock = mockFetch(200, { success: true });
        const props = renderModal();
        fireEvent.click(screen.getByLabelText(/Sale/));
        fireEvent.change(screen.getByLabelText('Commentaire (facultatif)'), { target: { value: '  Taché  ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le rendu' }));

        await waitFor(() => expect(props.onReturned).toHaveBeenCalled());
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('/api/uniforms/loans/l1/return');
        expect(JSON.parse(String(init.body))).toEqual({ returnedClean: false, comment: 'Taché' });
    });

    it('envoie comment=null quand le commentaire est vide', async () => {
        const fetchMock = mockFetch(200, { success: true });
        const props = renderModal();
        fireEvent.click(screen.getByLabelText(/Propre/));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le rendu' }));
        await waitFor(() => expect(props.onReturned).toHaveBeenCalled());
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(JSON.parse(String(init.body))).toEqual({ returnedClean: true, comment: null });
    });

    it('affiche l\'erreur serveur inline sans fermer', async () => {
        mockFetch(409, { error: 'Cette pièce a déjà été rendue' });
        const props = renderModal();
        fireEvent.click(screen.getByLabelText(/Propre/));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le rendu' }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/déjà été rendue/);
        expect(props.onReturned).not.toHaveBeenCalled();
    });

    it.each([404, 409])('sur %i (déjà rendue ailleurs), notifie le bandeau pour qu\'il se rafraîchisse', async (status) => {
        mockFetch(status, { error: 'Cette pièce a déjà été rendue' });
        const listener = vi.fn();
        window.addEventListener(UNIFORMS_CHANGED_EVENT, listener);
        renderModal();
        fireEvent.click(screen.getByLabelText(/Propre/));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le rendu' }));
        await screen.findByRole('alert');
        expect(listener).toHaveBeenCalled();
        window.removeEventListener(UNIFORMS_CHANGED_EVENT, listener);
    });

    it('sur une autre erreur, ne notifie pas', async () => {
        mockFetch(500, { error: 'Erreur serveur' });
        const listener = vi.fn();
        window.addEventListener(UNIFORMS_CHANGED_EVENT, listener);
        renderModal();
        fireEvent.click(screen.getByLabelText(/Propre/));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le rendu' }));
        await screen.findByRole('alert');
        expect(listener).not.toHaveBeenCalled();
        window.removeEventListener(UNIFORMS_CHANGED_EVENT, listener);
    });

    it('Annuler ferme la modale', () => {
        const props = renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(props.onClose).toHaveBeenCalled();
    });
});
