/**
 * Tests RTL — page `/uniforms` : onglets selon les rôles, onglet effectif
 * après changement d'UL, et chargement de l'onglet « Gestion ».
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({ useSession: () => mockUseSession() }));
const mockRouter = { push: vi.fn() };
// La card « Mes pièces empruntées » a ses propres tests et son propre appel API.
vi.mock('@/components/uniforms/UniformMyLoansCard', () => ({ default: () => <div data-testid="my-loans-card" /> }));
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
let menuVisibility = 'available';
vi.mock('@/lib/contexts/MenuSettingsContext', () => ({
    useMenuSettings: () => ({ getVisibility: () => menuVisibility }),
}));

import UniformsPage from '@/app/uniforms/page';

function sessionFor(roles: string[], ulId = 'ul-paris-18') {
    return {
        status: 'authenticated',
        data: { user: { roles, ulId, availableULs: [{ id: ulId, name: 'Paris 18' }] } },
    };
}

let catalogResponse: () => Promise<Response>;

beforeEach(() => {
    menuVisibility = 'available';
    catalogResponse = async () => new Response(JSON.stringify({ items: [] }), { status: 200 });
    global.fetch = vi.fn(async (url: string) => {
        if (String(url).startsWith('/api/uniforms/items')) return catalogResponse();
        if (String(url).startsWith('/api/uniforms/history')) {
            return new Response(JSON.stringify({ events: [], nextCursor: null, hasMore: false }), { status: 200 });
        }
        return new Response(JSON.stringify({ loans: [], pieces: [], truncated: false }), { status: 200 });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('UniformsPage', () => {
    it('onglets selon les rôles : CHVL = Emprunter + À laver', async () => {
        mockUseSession.mockReturnValue(sessionFor(['CHVL']));
        render(<UniformsPage />);
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Emprunter', 'À laver']);
    });

    it('affiche la card « Mes pièces empruntées » au-dessus des onglets', () => {
        mockUseSession.mockReturnValue(sessionFor(['CHVL']));
        render(<UniformsPage />);
        const card = screen.getByTestId('my-loans-card');
        const firstTab = screen.getAllByRole('tab')[0];
        expect(card.compareDocumentPosition(firstTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('ADMIN : les cinq onglets, Historique compris', () => {
        mockUseSession.mockReturnValue(sessionFor(['ADMIN']));
        render(<UniformsPage />);
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Emprunter', 'À laver', 'Emprunts', 'Gestion', 'Historique']);
    });

    it('RESP_UNIFORME seul : les cinq onglets', () => {
        mockUseSession.mockReturnValue(sessionFor(['RESP_UNIFORME']));
        render(<UniformsPage />);
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Emprunter', 'À laver', 'Emprunts', 'Gestion', 'Historique']);
    });

    it('CADRE et PRESIDENT : Emprunts (en cours) mais ni Gestion ni Historique', () => {
        for (const role of ['CADRE', 'PRESIDENT']) {
            mockUseSession.mockReturnValue(sessionFor([role]));
            const { unmount } = render(<UniformsPage />);
            expect(screen.getAllByRole('tab').map(t => t.textContent), role).toEqual(['Emprunter', 'À laver', 'Emprunts']);
            unmount();
        }
    });

    it('menu « Admin uniquement » : le responsable uniforme y accède, pas un cadre', () => {
        menuVisibility = 'admin_only';
        mockUseSession.mockReturnValue(sessionFor(['RESP_UNIFORME']));
        const { unmount } = render(<UniformsPage />);
        expect(screen.getAllByRole('tab')).toHaveLength(5);
        unmount();

        mockUseSession.mockReturnValue(sessionFor(['CADRE']));
        render(<UniformsPage />);
        expect(screen.queryAllByRole('tab')).toHaveLength(0);
        expect(mockRouter.push).toHaveBeenCalledWith('/vehicles');
    });

    it('Gestion : le responsable uniforme peut régénérer le QR code', async () => {
        mockUseSession.mockReturnValue(sessionFor(['RESP_UNIFORME']));
        render(<UniformsPage />);
        fireEvent.click(screen.getByRole('tab', { name: 'Gestion' }));
        fireEvent.click(await screen.findByRole('button', { name: /QR Code Uniformes/ }));
        expect(await screen.findByRole('button', { name: /Régénérer le QR Code/ })).toBeTruthy();
    });

    it('Historique charge le journal', async () => {
        mockUseSession.mockReturnValue(sessionFor(['RESP_UNIFORME']));
        render(<UniformsPage />);
        fireEvent.click(screen.getByRole('tab', { name: 'Historique' }));
        expect(await screen.findByText('Aucun événement.')).toBeTruthy();
        expect(global.fetch).toHaveBeenCalledWith('/api/uniforms/history?type=all');
    });

    it('Gestion affiche le chargement, pas « Aucun article », tant que le catalogue n\'est pas arrivé', () => {
        catalogResponse = () => new Promise(() => {});
        mockUseSession.mockReturnValue(sessionFor(['ADMIN']));
        render(<UniformsPage />);
        fireEvent.click(screen.getByRole('tab', { name: 'Gestion' }));
        expect(screen.getByText('Chargement...')).toBeTruthy();
        expect(screen.queryByText(/Aucun article/)).toBeNull();
    });

    it('Gestion affiche l\'erreur de chargement du catalogue', async () => {
        catalogResponse = async () => new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
        mockUseSession.mockReturnValue(sessionFor(['ADMIN']));
        render(<UniformsPage />);
        fireEvent.click(screen.getByRole('tab', { name: 'Gestion' }));
        expect((await screen.findByRole('alert')).textContent).toBe('Erreur serveur');
        expect(screen.queryByText(/Aucun article/)).toBeNull();
    });

    it('après un changement d\'UL au rôle moindre, retombe sur « Emprunter »', async () => {
        mockUseSession.mockReturnValue(sessionFor(['ADMIN']));
        const { rerender } = render(<UniformsPage />);
        fireEvent.click(screen.getByRole('tab', { name: 'Gestion' }));
        expect(await screen.findByText(/Aucun article/)).toBeTruthy();

        mockUseSession.mockReturnValue(sessionFor(['CHVL'], 'ul-paris-4'));
        rerender(<UniformsPage />);
        expect(screen.queryByRole('tab', { name: 'Gestion' })).toBeNull();
        expect(screen.getByRole('tab', { name: 'Emprunter' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.queryByText(/Aucun article\. Créez-en/)).toBeNull();
        expect(screen.queryByRole('button', { name: /Créer l'article/ })).toBeNull();
    });
});
