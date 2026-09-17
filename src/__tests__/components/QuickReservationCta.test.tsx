import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import QuickReservationCta from '@/app/vehicles/QuickReservationCta';
import { RESERVATION_CTA_MESSAGES } from '@/lib/vehicleReservationEligibility';

function renderCta(overrides: Partial<React.ComponentProps<typeof QuickReservationCta>> = {}) {
    const onOpen = vi.fn();
    render(
        <QuickReservationCta
            state="NOMINAL"
            message=""
            eligibleCount={3}
            onOpen={onOpen}
            {...overrides}
        />,
    );
    const button = screen.getByRole('button', { name: 'Réserver un véhicule' }) as HTMLButtonElement;
    return { onOpen, button };
}

describe('QuickReservationCta', () => {
    it('NOMINAL : affiche le nombre de véhicules réservables et ouvre le picker au clic', async () => {
        const user = userEvent.setup();
        const { onOpen, button } = renderCta({ state: 'NOMINAL', eligibleCount: 3 });

        expect(button.textContent).toBe('📅 Réserver (3 véhicules)');
        expect(button.disabled).toBe(false);

        await user.click(button);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('NOMINAL avec un seul véhicule : libellé au singulier', () => {
        const { button } = renderCta({ eligibleCount: 1 });
        expect(button.textContent).toBe('📅 Réserver (1 véhicule)');
    });

    it('LOADING : désactivée, libellé de chargement, aucun lien de refus', () => {
        const { button } = renderCta({ state: 'LOADING', message: '', eligibleCount: 0 });

        expect(button.disabled).toBe(true);
        expect(button.textContent).toBe('📅 Réserver…');
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('NONE_ELIGIBLE / ROLE_NOT_ALLOWED : désactivée, message littéral, lien calendrier', () => {
        const { button } = renderCta({
            state: 'NONE_ELIGIBLE',
            message: RESERVATION_CTA_MESSAGES.ROLE_NOT_ALLOWED,
            eligibleCount: 0,
        });

        expect(button.disabled).toBe(true);
        expect(screen.getByText("Votre rôle ne vous permet pas de réserver de véhicule.")).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Voir le calendrier' })).toBeTruthy();
    });

    it('NONE_ELIGIBLE / flotte vide : message littéral, jamais vide', () => {
        renderCta({
            state: 'NONE_ELIGIBLE',
            message: RESERVATION_CTA_MESSAGES.EMPTY_FLEET,
            eligibleCount: 0,
        });

        expect(screen.getByText("Aucun véhicule n'est rattaché à votre Unité Locale.")).toBeTruthy();
    });

    it('LICENSE_BLOCKED : désactivée, message papiers, lien de régularisation', () => {
        const { button } = renderCta({
            state: 'LICENSE_BLOCKED',
            message: RESERVATION_CTA_MESSAGES.LICENSE_BLOCKED,
            eligibleCount: 0,
        });

        expect(button.disabled).toBe(true);
        expect(screen.getByText(
            "Vos papiers n'ont pas été validés — réservation bloquée. Présentez vos papiers à votre DLUS/DLAS.",
        )).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Régulariser mes papiers' })).toBeTruthy();
    });
});
