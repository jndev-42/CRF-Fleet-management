import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({
    useSession: vi.fn(() => ({ data: { user: { id: 'admin-1', email: 'admin@test.com', roles: ['SUPER_ADMIN'], ulId: 'ul-paris-18' } }, status: 'authenticated', update: vi.fn() })),
}));

import UsersTab from '@/components/admin/UsersTab';
import type { User } from '@/components/admin/types';

const users: User[] = [
    { id: 'user-1', email: 'jean@test.com', name: 'Jean Dupont', createdAt: '2026-01-01', roles: ['CHVL'], papiers_valides: 0, last_validation: null, start_date_invalidation_process: null, validated_by: null },
    { id: 'user-2', email: 'marie@test.com', name: 'Marie Martin', createdAt: '2026-01-01', roles: ['ADMIN'], papiers_valides: 1, last_validation: null, start_date_invalidation_process: null, validated_by: null },
];

function mockFetch(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = async () => new Response(JSON.stringify({ uls: [] }), { status: 200 })) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

function baseProps(overrides: Partial<Parameters<typeof UsersTab>[0]> = {}) {
    return {
        users,
        availableRoles: ['CHVL', 'ADMIN'],
        isAdmin: true,
        onValidatePapers: vi.fn().mockResolvedValue(undefined),
        onCreateUser: vi.fn().mockResolvedValue(undefined),
        onDeleteUser: vi.fn().mockResolvedValue(undefined),
        showToast: vi.fn(),
        ...overrides,
    };
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('UsersTab', () => {
    it('affiche tous les utilisateurs de la page courante', () => {
        mockFetch();
        render(<UsersTab {...baseProps()} />);
        expect(screen.getByText('jean@test.com')).toBeTruthy();
        expect(screen.getByText('marie@test.com')).toBeTruthy();
    });

    it('filtre les utilisateurs par recherche', () => {
        mockFetch();
        render(<UsersTab {...baseProps()} />);
        fireEvent.change(screen.getByPlaceholderText('Rechercher par nom ou email...'), { target: { value: 'marie' } });
        expect(screen.queryByText('jean@test.com')).toBeNull();
        expect(screen.getByText('marie@test.com')).toBeTruthy();
    });

    it('ouvre AddUserModal via le bouton "Ajouter un utilisateur"', () => {
        mockFetch();
        render(<UsersTab {...baseProps()} />);
        fireEvent.click(screen.getByRole('button', { name: /Ajouter un utilisateur/ }));
        expect(screen.getByRole('heading', { name: '➕ Ajouter un utilisateur' })).toBeTruthy();
    });

    it('masque le bouton d\'ajout pour un non-admin', () => {
        mockFetch();
        render(<UsersTab {...baseProps({ isAdmin: false })} />);
        expect(screen.queryByRole('button', { name: /Ajouter un utilisateur/ })).toBeNull();
    });

    it('crée un utilisateur via la modale et affiche un toast de succès', async () => {
        mockFetch();
        const onCreateUser = vi.fn().mockResolvedValue(undefined);
        const showToast = vi.fn();
        render(<UsersTab {...baseProps({ onCreateUser, showToast })} />);

        fireEvent.click(screen.getByRole('button', { name: /Ajouter un utilisateur/ }));
        fireEvent.change(screen.getByPlaceholderText('prenom.nom@croix-rouge.fr'), { target: { value: 'nouveau@croix-rouge.fr' } });
        fireEvent.change(screen.getByPlaceholderText('Prénom NOM'), { target: { value: 'Nouveau User' } });
        fireEvent.click(screen.getByRole('button', { name: /Créer l'utilisateur/ }));

        await waitFor(() => {
            expect(onCreateUser).toHaveBeenCalledWith('nouveau@croix-rouge.fr', 'Nouveau User', [], null);
            expect(showToast).toHaveBeenCalledWith('Utilisateur nouveau@croix-rouge.fr ajouté avec succès !');
        });
        expect(screen.queryByRole('heading', { name: '➕ Ajouter un utilisateur' })).toBeNull();
    });

    it('supprime un utilisateur via DeleteUserModal après confirmation', async () => {
        mockFetch();
        const onDeleteUser = vi.fn().mockResolvedValue(undefined);
        const showToast = vi.fn();
        render(<UsersTab {...baseProps({ onDeleteUser, showToast })} />);

        const deleteButtons = screen.getAllByRole('button', { name: '🗑️' });
        fireEvent.click(deleteButtons[0]);

        const confirmButton = await screen.findByRole('button', { name: /Supprimer/ });
        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(onDeleteUser).toHaveBeenCalledWith('jean@test.com');
            expect(showToast).toHaveBeenCalledWith('Utilisateur jean@test.com supprimé');
        });
    });

    it('affiche un toast d\'erreur si la création échoue', async () => {
        mockFetch();
        const onCreateUser = vi.fn().mockRejectedValue(new Error('Email déjà utilisé'));
        const showToast = vi.fn();
        render(<UsersTab {...baseProps({ onCreateUser, showToast })} />);

        fireEvent.click(screen.getByRole('button', { name: /Ajouter un utilisateur/ }));
        fireEvent.change(screen.getByPlaceholderText('prenom.nom@croix-rouge.fr'), { target: { value: 'dup@croix-rouge.fr' } });
        fireEvent.change(screen.getByPlaceholderText('Prénom NOM'), { target: { value: 'Dup User' } });
        fireEvent.click(screen.getByRole('button', { name: /Créer l'utilisateur/ }));

        await waitFor(() => {
            expect(showToast).toHaveBeenCalledWith('Email déjà utilisé', 'error');
        });
    });
});
