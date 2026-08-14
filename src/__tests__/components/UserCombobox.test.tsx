import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import UserCombobox from '@/components/ui/UserCombobox';

const users = [
    { id: 'u1', name: 'Jean Dupont', email: 'jean@test.com' },
    { id: 'u2', name: null, email: 'marie@test.com' },
];

describe('UserCombobox', () => {
    it('affiche le label par défaut sans sélection', () => {
        render(<UserCombobox users={users} value="" onChange={vi.fn()} defaultLabel="— Choisir —" />);
        expect(screen.getByText('— Choisir —')).toBeTruthy();
    });

    it('affiche le nom de l\'utilisateur sélectionné', () => {
        render(<UserCombobox users={users} value="u1" onChange={vi.fn()} />);
        expect(screen.getByText('Jean Dupont')).toBeTruthy();
    });

    it('retombe sur l\'email si l\'utilisateur n\'a pas de nom', () => {
        render(<UserCombobox users={users} value="u2" onChange={vi.fn()} />);
        expect(screen.getByText('marie@test.com')).toBeTruthy();
    });

    it('ouvre le menu déroulant au clic sur le déclencheur', () => {
        render(<UserCombobox users={users} value="" onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button'));
        expect(screen.getByRole('listbox')).toBeTruthy();
        expect(screen.getByText('Jean Dupont')).toBeTruthy();
    });

    it('filtre les utilisateurs par recherche (nom ou email)', () => {
        render(<UserCombobox users={users} value="" onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button'));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'marie' } });

        expect(screen.queryByText('Jean Dupont')).toBeNull();
        expect(screen.getByText('marie@test.com')).toBeTruthy();
    });

    it('exclut un utilisateur par email (excludeEmail)', () => {
        render(<UserCombobox users={users} value="" onChange={vi.fn()} excludeEmail="jean@test.com" />);
        fireEvent.click(screen.getByRole('button'));
        expect(screen.queryByText('Jean Dupont')).toBeNull();
    });

    it('sélectionne un utilisateur et ferme le menu', () => {
        const onChange = vi.fn();
        render(<UserCombobox users={users} value="" onChange={onChange} />);
        fireEvent.click(screen.getByRole('button'));
        fireEvent.click(screen.getByText('Jean Dupont'));

        expect(onChange).toHaveBeenCalledWith('u1');
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('affiche "Chauffeur non décidé" pour la valeur spéciale UNASSIGNED', () => {
        render(<UserCombobox users={users} value="UNASSIGNED" onChange={vi.fn()} />);
        expect(screen.getByText('Chauffeur non décidé')).toBeTruthy();
    });
});
