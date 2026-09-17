/**
 * Tests du modal de confirmation de suppression d'une maintenance (calendrier).
 *
 * Fichier testé : src/components/vehicle/modals/DeleteMaintenanceEventModal.tsx
 *
 * `VehicleCalendar` n'a pas de toaster : les erreurs serveur (dont le 409
 * « maintenance terminée ») s'affichent dans un état local du modal.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeleteMaintenanceEventModal from '@/components/vehicle/modals/DeleteMaintenanceEventModal';

const baseEvent = {
    id: 'm-1',
    // L'URL est bâtie sur l'UUID, pas sur le nom : `Vehicle.name` n'est pas UNIQUE.
    vehicleId: '7b1c0f2e-0a44-4c9e-9a0b-5f2d1e3c4b5a',
    vehicleName: 'VSAV 01',
    startDate: '2026-07-20T08:30:00.000Z',
    endDate: null,
    reason: 'Panne embrayage',
};

const EXPECTED_URL = '/api/vehicles/7b1c0f2e-0a44-4c9e-9a0b-5f2d1e3c4b5a/maintenance-events/m-1';
const CONFIRM_LABEL = 'Confirmer la suppression';

function renderModal(overrides: Partial<React.ComponentProps<typeof DeleteMaintenanceEventModal>> = {}) {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const utils = render(
        <DeleteMaintenanceEventModal event={baseEvent} onClose={onClose} onSuccess={onSuccess} {...overrides} />,
    );
    return { ...utils, onClose, onSuccess };
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('DeleteMaintenanceEventModal', () => {
    it('récapitule le véhicule, le motif et la fin inconnue', () => {
        const { container } = renderModal();

        expect(screen.getByText('🗑️ Supprimer la maintenance')).toBeTruthy();
        expect(container.textContent).toContain('VSAV 01');
        expect(container.textContent).toContain('Panne embrayage');
        expect(container.textContent).toContain('Date de fin inconnue');
    });

    it('n\'appelle aucun fetch tant que la suppression n\'est pas confirmée', () => {
        const fetchSpy = vi.spyOn(global, 'fetch');
        renderModal();

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('appelle DELETE sur l\'URL encodée puis onSuccess sur 200', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
        } as Response);

        const { onSuccess } = renderModal();
        await userEvent.click(screen.getByRole('button', { name: CONFIRM_LABEL }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe(EXPECTED_URL);
        expect((init as RequestInit).method).toBe('DELETE');
    });

    it('affiche le message d\'erreur du serveur sur 409 et n\'appelle pas onSuccess', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: false,
            status: 409,
            json: async () => ({ error: "Cette maintenance est terminée et n'est plus modifiable" }),
        } as Response);

        const { onSuccess } = renderModal();
        await userEvent.click(screen.getByRole('button', { name: CONFIRM_LABEL }));

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe("Cette maintenance est terminée et n'est plus modifiable");
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('ferme le modal via « Annuler » sans rien supprimer', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch');
        const { onClose } = renderModal();

        await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
