/**
 * Tests RTL — page `/uniforms` : onglets selon les rôles, onglet effectif
 * après changement d'UL, et chargement de l'onglet « Gestion ».
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({ useSession: () => mockUseSession() }));
const mockRouter = { push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }));
vi.mock('@/lib/contexts/MenuSettingsContext', () => ({
    useMenuSettings: () => ({ getVisibility: () => 'available' }),
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
    catalogResponse = async () => new Response(JSON.stringify({ items: [] }), { status: 200 });
    global.fetch = vi.fn(async (url: string) => {
        if (String(url).startsWith('/api/uniforms/items')) return catalogResponse();
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

    it('ADMIN : les quatre onglets', () => {
        mockUseSession.mockReturnValue(sessionFor(['ADMIN']));
        render(<UniformsPage />);
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Emprunter', 'À laver', 'Emprunts', 'Gestion']);
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
