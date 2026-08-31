import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import ExpensesHeader from '@/app/expenses/ExpensesHeader';

function renderHeader(props: Partial<React.ComponentProps<typeof ExpensesHeader>> = {}) {
    const onCreate = vi.fn();
    const onManageBudgets = vi.fn();
    const utils = render(
        <ExpensesHeader
            userRoles={['CADRE']}
            isManager={false}
            isTresorier={false}
            showCreateButton
            onCreate={onCreate}
            onManageBudgets={onManageBudgets}
            {...props}
        />
    );
    return { ...utils, onCreate, onManageBudgets };
}

describe('ExpensesHeader', () => {
    it('affiche le titre et le sous-titre du demandeur par défaut', () => {
        renderHeader();
        expect(screen.getByRole('heading', { name: 'Notes de frais' })).toBeTruthy();
        expect(screen.getByText('Suivez et soumettez vos notes de frais.')).toBeTruthy();
    });

    it('adapte le sous-titre au responsable et au trésorier', () => {
        const { unmount } = renderHeader({ isManager: true });
        expect(screen.getByText(/Gérer, valider et refuser/)).toBeTruthy();
        unmount();

        renderHeader({ isTresorier: true });
        expect(screen.getByText(/en attente de paiement/)).toBeTruthy();
    });

    it('le bouton Gérer les budgets est masqué pour un rôle non habilité', () => {
        renderHeader({ userRoles: ['CHVL'] });
        expect(screen.queryByRole('button', { name: /Gérer les budgets/ })).toBeNull();
    });

    it('le bouton Gérer les budgets est visible pour les rôles habilités', () => {
        for (const role of ['CADRE', 'PRESIDENT', 'TRESORIER', 'ADMIN', 'SUPER_ADMIN']) {
            const { unmount } = renderHeader({ userRoles: [role] });
            expect(screen.getByRole('button', { name: /Gérer les budgets/ })).toBeTruthy();
            unmount();
        }
    });

    it('déclenche les actions de création et de gestion des budgets', () => {
        const { onCreate, onManageBudgets } = renderHeader();

        fireEvent.click(screen.getByRole('button', { name: /Nouvelle note de frais/ }));
        expect(onCreate).toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /Gérer les budgets/ }));
        expect(onManageBudgets).toHaveBeenCalled();
    });

    it('masque le bouton de création pendant la saisie', () => {
        renderHeader({ showCreateButton: false });
        expect(screen.queryByRole('button', { name: /Nouvelle note de frais/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Gérer les budgets/ })).toBeTruthy();
    });
});
