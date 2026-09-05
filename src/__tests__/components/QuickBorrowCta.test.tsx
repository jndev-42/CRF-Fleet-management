import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import QuickBorrowCta from '@/app/vehicles/QuickBorrowCta';
import { BORROW_CTA_MESSAGES } from '@/lib/vehicleBorrowEligibility';

function renderCta(overrides: Partial<React.ComponentProps<typeof QuickBorrowCta>> = {}) {
    const onOpen = vi.fn();
    render(
        <QuickBorrowCta
            state="NOMINAL"
            message=""
            eligibleCount={3}
            onOpen={onOpen}
            {...overrides}
        />,
    );
    const button = screen.getByRole('button', { name: 'Emprunter un véhicule' }) as HTMLButtonElement;
    return { onOpen, button };
}

describe('QuickBorrowCta', () => {
    it('NOMINAL : affiche le nombre de véhicules disponibles et ouvre le picker au clic', async () => {
        const user = userEvent.setup();
        const { onOpen, button } = renderCta({ state: 'NOMINAL', eligibleCount: 3 });

        expect(button.textContent).toBe('🚗 Emprunter (3 dispo)');
        expect(button.disabled).toBe(false);

        await user.click(button);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('NONE_ELIGIBLE / RESERVED_BY_OTHER : désactivée, message littéral, lien calendrier', () => {
        const { button } = renderCta({
            state: 'NONE_ELIGIBLE',
            message: BORROW_CTA_MESSAGES.RESERVED_BY_OTHER,
            eligibleCount: 0,
        });

        expect(button.disabled).toBe(true);
        expect(screen.getByText("Tous les véhicules disponibles sont réservés par quelqu'un d'autre.")).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Voir le calendrier' })).toBeTruthy();
    });

    it('NONE_ELIGIBLE / ROLE_NOT_ALLOWED : message littéral', () => {
        renderCta({
            state: 'NONE_ELIGIBLE',
            message: BORROW_CTA_MESSAGES.ROLE_NOT_ALLOWED,
            eligibleCount: 0,
        });

        expect(screen.getByText("Votre rôle ne vous permet pas d'emprunter de véhicule.")).toBeTruthy();
    });

    it('NONE_ELIGIBLE / reason null (flotte vide) : message littéral, jamais vide', () => {
        renderCta({
            state: 'NONE_ELIGIBLE',
            message: BORROW_CTA_MESSAGES.EMPTY_FLEET,
            eligibleCount: 0,
        });

        expect(screen.getByText("Aucun véhicule n'est rattaché à votre Unité Locale.")).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Voir le calendrier' })).toBeTruthy();
    });

    it('LICENSE_BLOCKED : désactivée, message papiers, lien de régularisation', () => {
        const { button } = renderCta({
            state: 'LICENSE_BLOCKED',
            message: BORROW_CTA_MESSAGES.LICENSE_BLOCKED,
            eligibleCount: 0,
        });

        expect(button.disabled).toBe(true);
        expect(screen.getByText(
            "Vos papiers n'ont pas été validés dans les délais — emprunt impossible. Présentez vos papiers à votre DLUS/DLAS.",
        )).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Régulariser mes papiers' })).toBeTruthy();
    });

    it('LOADING : désactivée, aucun crash, aucun lien de refus', () => {
        const { button } = renderCta({ state: 'LOADING', message: '', eligibleCount: 0 });

        expect(button.disabled).toBe(true);
        expect(button.textContent).toBe('🚗 Emprunter…');
        expect(screen.queryByRole('link')).toBeNull();
    });
});
