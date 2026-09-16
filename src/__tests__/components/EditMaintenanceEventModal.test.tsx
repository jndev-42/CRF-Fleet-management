/**
 * Tests du modal de modification d'une maintenance depuis le calendrier.
 *
 * Fichier testé : src/components/vehicle/modals/EditMaintenanceEventModal.tsx
 *
 * ⚠️ FUSEAU FIGÉ. Le préremplissage est un aller-retour UTC → heure LOCALE : lu via
 * `getFullYear`/`getHours`, jamais via `toISOString().split('T')`. Un test exécuté en
 * UTC ne distinguerait pas les deux implémentations. On force donc `Europe/Paris`
 * (UTC+2 en juillet) le temps du fichier, et on le restaure ensuite — les fichiers de
 * test partagent le process du worker Vitest.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'Europe/Paris'; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

import EditMaintenanceEventModal from '@/components/vehicle/modals/EditMaintenanceEventModal';

// 08:30 UTC un 20 juillet = 10:30 à Paris. Le jour ne change pas, l'heure si.
const START_ISO = '2026-07-20T08:30:00.000Z';
// 23:00 UTC un 24 juillet = 01:00 le 25 à Paris : ici c'est le JOUR qui change.
const END_ISO = '2026-07-24T23:00:00.000Z';

const baseEvent = {
    id: 'm-1',
    // L'URL est bâtie sur l'UUID, pas sur le nom : `Vehicle.name` n'est pas UNIQUE.
    vehicleId: '7b1c0f2e-0a44-4c9e-9a0b-5f2d1e3c4b5a',
    vehicleName: 'VSAV 01',
    startDate: START_ISO,
    endDate: END_ISO,
    reason: 'Panne embrayage',
};

const EXPECTED_URL = '/api/vehicles/7b1c0f2e-0a44-4c9e-9a0b-5f2d1e3c4b5a/maintenance-events/m-1';

function renderModal(overrides: Partial<React.ComponentProps<typeof EditMaintenanceEventModal>> = {}) {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const utils = render(
        <EditMaintenanceEventModal event={baseEvent} onClose={onClose} onSuccess={onSuccess} {...overrides} />,
    );
    return { ...utils, onClose, onSuccess };
}

function input(id: string): HTMLInputElement {
    return document.getElementById(id) as HTMLInputElement;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('EditMaintenanceEventModal — préremplissage local', () => {
    it('convertit le startDate UTC en jour ET heure locale', () => {
        renderModal();

        expect(input('edit-maintenance-start-date').value).toBe('2026-07-20');
        expect((screen.getByLabelText('Heure de début') as HTMLSelectElement).value).toBe('10');
        expect((screen.getByLabelText('Minutes de début') as HTMLSelectElement).value).toBe('30');
    });

    it('bascule le jour de fin quand l\'heure locale déborde sur le lendemain', () => {
        renderModal();

        // 2026-07-24T23:00Z → 2026-07-25 01:00 à Paris. `toISOString()` afficherait le 24.
        expect(input('edit-maintenance-end-date').value).toBe('2026-07-25');
        expect((screen.getByLabelText('Heure de fin') as HTMLSelectElement).value).toBe('01');
        expect((screen.getByLabelText('Minutes de fin') as HTMLSelectElement).value).toBe('00');
    });

    it('préremplit la raison et décoche « date de fin inconnue »', () => {
        renderModal();

        expect((document.getElementById('edit-maintenance-reason') as HTMLTextAreaElement).value)
            .toBe('Panne embrayage');
        expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    });

    it('coche « date de fin inconnue » quand endDate est null', () => {
        renderModal({ event: { ...baseEvent, endDate: null } });

        expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
        expect(input('edit-maintenance-end-date').value).toBe('');
    });
});

describe('EditMaintenanceEventModal — soumission', () => {
    it('appelle PATCH sur l\'URL encodée puis onSuccess sur 200', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
        } as Response);

        const { onSuccess } = renderModal();
        await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe(EXPECTED_URL);
        expect((init as RequestInit).method).toBe('PATCH');

        const body = JSON.parse((init as RequestInit).body as string);
        expect(body.reason).toBe('Panne embrayage');
        // Round-trip stable : l'instant renvoyé est celui d'origine.
        expect(body.startDate).toBe(START_ISO);
        expect(body.endDate).toBe(END_ISO);
    });

    it('envoie endDate null quand la case « date de fin inconnue » est cochée', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
        } as Response);

        renderModal({ event: { ...baseEvent, endDate: null } });
        await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

        await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
        const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
        expect(body.endDate).toBeNull();
    });

    it('affiche le message d\'erreur du serveur sur 409 et n\'appelle pas onSuccess', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: false,
            status: 409,
            json: async () => ({ error: "Cette maintenance est terminée et n'est plus modifiable" }),
        } as Response);

        const { onSuccess } = renderModal();
        await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe("Cette maintenance est terminée et n'est plus modifiable");
        expect(onSuccess).not.toHaveBeenCalled();
    });
});
