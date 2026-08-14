import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import UsersTable from '@/components/admin/UsersTable';
import type { User, ULEntry } from '@/components/admin/types';

const baseUser: User = {
    id: 'user-1',
    email: 'chauffeur@test.com',
    name: 'Jean Dupont',
    createdAt: '2026-01-01',
    roles: ['CHVL'],
    papiers_valides: 0,
    last_validation: null,
    start_date_invalidation_process: null,
    validated_by: null,
};

const uls: ULEntry[] = [{ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' }];

function baseProps(overrides: Partial<Parameters<typeof UsersTable>[0]> = {}) {
    return {
        users: [baseUser],
        currentPage: 1,
        totalPages: 1,
        rangeStart: 1,
        rangeEnd: 1,
        totalCount: 1,
        onPageChange: vi.fn(),
        isAdmin: true,
        isReadOnly: false,
        availableULs: uls,
        userULs: {},
        onAssignUL: vi.fn(),
        onValidatePapers: vi.fn(),
        onManageULs: vi.fn(),
        onRequestDelete: vi.fn(),
        ...overrides,
    };
}

describe('UsersTable', () => {
    it('affiche un message quand la liste est vide', () => {
        render(<UsersTable {...baseProps({ users: [], rangeStart: 0, rangeEnd: 0, totalCount: 0 })} />);
        expect(screen.getByText('Aucun utilisateur trouvé.')).toBeTruthy();
    });

    it('affiche le statut "Non validés" pour un chauffeur sans papiers validés', () => {
        render(<UsersTable {...baseProps()} />);
        expect(screen.getByText(/Non validés/)).toBeTruthy();
        expect(screen.getByRole('button', { name: '🪪 Valider les papiers' })).toBeTruthy();
    });

    it('affiche le statut "Valides" avec la date pour un chauffeur validé', () => {
        const validatedUser = { ...baseUser, papiers_valides: 1, last_validation: '2026-01-15', validated_by: 'admin@test.com' };
        render(<UsersTable {...baseProps({ users: [validatedUser] })} />);
        expect(screen.getByText(/Valides \(2026-01-15\)/)).toBeTruthy();
        expect(screen.getByText('par admin@test.com')).toBeTruthy();
        expect(screen.queryByRole('button', { name: '🪪 Valider les papiers' })).toBeNull();
    });

    it('n\'affiche pas de statut papiers pour un non-chauffeur', () => {
        const admin = { ...baseUser, roles: ['ADMIN'] };
        render(<UsersTable {...baseProps({ users: [admin] })} />);
        expect(screen.queryByRole('button', { name: '🪪 Valider les papiers' })).toBeNull();
    });

    it('appelle onValidatePapers au clic', () => {
        const onValidatePapers = vi.fn();
        render(<UsersTable {...baseProps({ onValidatePapers })} />);
        fireEvent.click(screen.getByRole('button', { name: '🪪 Valider les papiers' }));
        expect(onValidatePapers).toHaveBeenCalledWith('user-1', 'Jean Dupont');
    });

    it('appelle onAssignUL au changement de sélection UL (admin uniquement)', () => {
        const onAssignUL = vi.fn();
        render(<UsersTable {...baseProps({ onAssignUL })} />);
        fireEvent.change(screen.getByLabelText('UL de chauffeur@test.com'), { target: { value: 'ul-paris-18' } });
        expect(onAssignUL).toHaveBeenCalledWith('chauffeur@test.com', 'ul-paris-18');
    });

    it('masque la colonne UL et les actions admin pour un non-admin', () => {
        render(<UsersTable {...baseProps({ isAdmin: false })} />);
        expect(screen.queryByLabelText('UL de chauffeur@test.com')).toBeNull();
        expect(screen.queryByRole('button', { name: '🗑️' })).toBeNull();
    });

    it('masque les actions de gestion en lecture seule', () => {
        render(<UsersTable {...baseProps({ isReadOnly: true })} />);
        expect(screen.queryByRole('button', { name: '🔑 Droits UL' })).toBeNull();
        expect(screen.queryByRole('button', { name: '🗑️' })).toBeNull();
    });

    it('appelle onRequestDelete au clic sur supprimer', () => {
        const onRequestDelete = vi.fn();
        render(<UsersTable {...baseProps({ onRequestDelete })} />);
        fireEvent.click(screen.getByRole('button', { name: '🗑️' }));
        expect(onRequestDelete).toHaveBeenCalledWith('chauffeur@test.com', 'Jean Dupont');
    });

    it('navigue entre les pages via onPageChange', () => {
        const onPageChange = vi.fn();
        render(<UsersTable {...baseProps({ currentPage: 2, totalPages: 3, onPageChange })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(onPageChange).toHaveBeenCalledWith(3);
        fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
        expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('affiche le bouton incarner uniquement pour le super-compte sur un autre utilisateur', () => {
        const onImpersonate = vi.fn();
        render(<UsersTable {...baseProps({ originalUserEmail: 'jeannoel.durand@croix-rouge.fr', onImpersonate })} />);
        expect(screen.getByTitle('Incarner Jean Dupont')).toBeTruthy();
    });
});
