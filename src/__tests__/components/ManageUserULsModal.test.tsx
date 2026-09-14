import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({
    useSession: vi.fn(),
}));

import ManageUserULsModal from '@/components/admin/modals/ManageUserULsModal';
import { useSession } from 'next-auth/react';
import type { User, ULEntry } from '@/components/admin/types';

const mockUseSession = vi.mocked(useSession);

const targetUser: User = {
    id: 'user-2',
    email: 'chauffeur@test.com',
    name: 'Jean Dupont',
    createdAt: '2026-01-01',
    roles: ['CHVL'],
    papiers_valides: 1,
    last_validation: null,
    start_date_invalidation_process: null,
    validated_by: null,
};

const uls: ULEntry[] = [
    { id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' },
    { id: 'ul-lyon-3', name: 'Lyon 3', slug: 'lyon-3' },
];

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

function mockFetch(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

function mockSuperAdminSession() {
    mockUseSession.mockReturnValue({
        data: { user: { id: 'admin-1', email: 'admin@test.com', roles: ['SUPER_ADMIN'], ulId: 'ul-paris-18' } },
        status: 'authenticated',
        update: vi.fn(),
    } as never);
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ManageUserULsModal', () => {
    it('affiche un chargement puis les droits UL existants', async () => {
        mockSuperAdminSession();
        mockFetch(async () => new Response(JSON.stringify({ uls: [{ id: 'ul-paris-18', isHome: true, roles: ['CHVL'] }] }), { status: 200 }));

        render(<ManageUserULsModal user={targetUser} availableULs={uls} availableRoles={['CHVL', 'ADMIN']} onClose={vi.fn()} showToast={vi.fn()} />);

        expect(await screen.findByText('Unité Locale Paris 18')).toBeTruthy();
    });

    it('affiche un message quand l\'utilisateur n\'a pas d\'UL principale', async () => {
        mockSuperAdminSession();
        mockFetch(async () => new Response(JSON.stringify({ uls: [] }), { status: 200 }));

        render(<ManageUserULsModal user={targetUser} availableULs={uls} availableRoles={['CHVL']} onClose={vi.fn()} showToast={vi.fn()} />);

        expect(await screen.findByText('Aucune UL principale (appartenance : default).')).toBeTruthy();
        expect(screen.getByText('Aucun droit externe configuré. L\'utilisateur n\'a accès qu\'à son UL principale.')).toBeTruthy();
    });

    it('ajoute une ligne de droits externes et permet de choisir une UL', async () => {
        mockSuperAdminSession();
        mockFetch(async () => new Response(JSON.stringify({ uls: [] }), { status: 200 }));

        render(<ManageUserULsModal user={targetUser} availableULs={uls} availableRoles={['CHVL']} onClose={vi.fn()} showToast={vi.fn()} />);

        await screen.findByText('Aucun droit externe configuré. L\'utilisateur n\'a accès qu\'à son UL principale.');
        fireEvent.click(screen.getByRole('button', { name: '➕ Ajouter des droits externes' }));

        expect(screen.getByText('Choisir une Unité Locale...')).toBeTruthy();

        // Un SUPER_ADMIN peut retirer la ligne qu'il vient d'ajouter.
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        expect(screen.queryByText('Choisir une Unité Locale...')).toBeNull();
    });

    it('enregistre les droits UL et ferme la modale (happy path)', async () => {
        mockSuperAdminSession();
        const fetchMock = mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (init?.method === 'PUT') return new Response(JSON.stringify({ success: true }), { status: 200 });
            if (url.includes('/ul')) return new Response(JSON.stringify({ uls: [] }), { status: 200 });
            return new Response(JSON.stringify({}), { status: 200 });
        });
        const onClose = vi.fn();
        const showToast = vi.fn();

        render(<ManageUserULsModal user={targetUser} availableULs={uls} availableRoles={['CHVL']} onClose={onClose} showToast={showToast} />);

        await screen.findByText('Aucun droit externe configuré. L\'utilisateur n\'a accès qu\'à son UL principale.');
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer les droits/ }));

        await waitFor(() => {
            expect(showToast).toHaveBeenCalledWith('Droits UL mis à jour avec succès');
            expect(onClose).toHaveBeenCalled();
        });

        const putCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'PUT');
        expect(putCall).toBeTruthy();
    });

    it('refuse d\'enregistrer si la même UL est sélectionnée deux fois', async () => {
        mockSuperAdminSession();
        mockFetch(async () => new Response(JSON.stringify({
            uls: [
                { id: 'ul-lyon-3', isHome: false, roles: ['CHVL'] },
                { id: 'ul-lyon-3', isHome: false, roles: ['ADMIN'] },
            ],
        }), { status: 200 }));
        const showToast = vi.fn();

        render(<ManageUserULsModal user={targetUser} availableULs={uls} availableRoles={['CHVL', 'ADMIN']} onClose={vi.fn()} showToast={showToast} />);

        await screen.findAllByText('Unité Locale Lyon 3');
        fireEvent.click(screen.getByRole('button', { name: /Enregistrer les droits/ }));

        expect(showToast).toHaveBeenCalledWith("Chaque Unité Locale ne peut être sélectionnée qu'une seule fois.", 'error');
    });

    it('restreint le choix d\'UL externe à sa propre UL pour un non-SUPER_ADMIN', async () => {
        mockUseSession.mockReturnValue({
            data: { user: { id: 'admin-1', email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } },
            status: 'authenticated',
            update: vi.fn(),
        } as never);
        mockFetch(async () => new Response(JSON.stringify({ uls: [] }), { status: 200 }));

        render(<ManageUserULsModal user={targetUser} availableULs={uls} availableRoles={['CHVL']} onClose={vi.fn()} showToast={vi.fn()} />);

        await screen.findByText('Aucun droit externe configuré. L\'utilisateur n\'a accès qu\'à son UL principale.');
        fireEvent.click(screen.getByRole('button', { name: '➕ Ajouter des droits externes' }));

        const options = screen.getAllByRole('option').map(o => o.textContent);
        expect(options).not.toContain('Unité Locale Lyon 3');
    });

    it('désactive INACTIF sur une ligne non-home et le laisse actif sur la ligne home (AC-F9)', async () => {
        // L'interface ne doit pas permettre de composer une requête que l'API refusera
        // en 400 — et c'est elle qui tarit l'arrivée de nouvelles lignes non conformes.
        mockSuperAdminSession();
        mockFetch(async () => new Response(JSON.stringify({
            uls: [
                { id: 'ul-paris-18', isHome: true, roles: ['CHVL'] },
                { id: 'ul-lyon-3', isHome: false, roles: ['CHVL'] },
            ],
        }), { status: 200 }));

        const { container } = render(
            <ManageUserULsModal user={targetUser} availableULs={uls} availableRoles={['CHVL', 'INACTIF']} onClose={vi.fn()} showToast={vi.fn()} />
        );

        await screen.findByText('Unité Locale Paris 18');

        const inactifBoxes = Array.from(
            container.querySelectorAll('label')
        ).filter(l => l.textContent?.trim() === 'INACTIF')
         .map(l => l.querySelector('input') as HTMLInputElement);

        // Deux lignes affichées : la home en premier, puis la ligne externe.
        expect(inactifBoxes).toHaveLength(2);
        expect(inactifBoxes[0].disabled).toBe(false);   // ligne home
        expect(inactifBoxes[1].disabled).toBe(true);    // ligne non-home
    });
});
