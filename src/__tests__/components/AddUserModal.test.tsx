import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AddUserModal from '@/components/admin/modals/AddUserModal';
import type { ULEntry } from '@/components/admin/types';

const uls: ULEntry[] = [
    { id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' },
    { id: 'ul-lyon-3', name: 'Lyon 3', slug: 'lyon-3' },
];

describe('AddUserModal', () => {
    it('présélectionne la première UL disponible', () => {
        render(<AddUserModal availableRoles={['CHVL', 'ADMIN']} availableULs={uls} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect(screen.getByDisplayValue('Unité Locale Paris 18')).toBeTruthy();
    });

    it('présélectionne l\'UL de l\'admin courant si elle existe dans la liste', () => {
        render(<AddUserModal availableRoles={[]} availableULs={uls} userUlId="ul-lyon-3" onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect(screen.getByDisplayValue('Unité Locale Lyon 3')).toBeTruthy();
    });

    it('bascule un rôle sélectionné au clic', () => {
        render(<AddUserModal availableRoles={['CHVL', 'ADMIN']} availableULs={uls} onClose={vi.fn()} onSuccess={vi.fn()} />);
        const chvlCheckbox = screen.getByText('CHVL').closest('label')!.querySelector('input') as HTMLInputElement;
        expect(chvlCheckbox.checked).toBe(false);
        fireEvent.click(chvlCheckbox);
        expect(chvlCheckbox.checked).toBe(true);
    });

    it('soumet le formulaire avec les valeurs saisies (happy path)', async () => {
        const onSuccess = vi.fn().mockResolvedValue(undefined);
        render(<AddUserModal availableRoles={['CHVL', 'ADMIN']} availableULs={uls} onClose={vi.fn()} onSuccess={onSuccess} />);

        fireEvent.change(screen.getByPlaceholderText('prenom.nom@croix-rouge.fr'), { target: { value: 'nouveau@croix-rouge.fr' } });
        fireEvent.change(screen.getByPlaceholderText('Prénom NOM'), { target: { value: 'Nouveau User' } });
        fireEvent.click(screen.getByText('CHVL').closest('label')!.querySelector('input') as HTMLInputElement);
        fireEvent.click(screen.getByRole('button', { name: /Créer l'utilisateur/ }));

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalledWith('nouveau@croix-rouge.fr', 'Nouveau User', ['CHVL'], 'ul-paris-18');
        });
    });

    it('appelle onClose au clic sur Annuler ou la croix', () => {
        const onClose = vi.fn();
        render(<AddUserModal availableRoles={[]} availableULs={uls} onClose={onClose} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: '✕' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
