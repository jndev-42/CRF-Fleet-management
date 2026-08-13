import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PutInMaintenanceModal from '@/components/vehicle/modals/PutInMaintenanceModal';

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('PutInMaintenanceModal', () => {
    it('refuse la soumission sans raison', () => {
        const showToast = vi.fn();
        const { container } = render(<PutInMaintenanceModal vehicleName="VL186" onClose={vi.fn()} onSuccess={vi.fn()} showToast={showToast} />);

        // fireEvent.submit contourne la validation HTML5 native (champ "required")
        // pour exercer directement la vérification manuelle du gestionnaire.
        fireEvent.submit(container.querySelector('form') as HTMLFormElement);
        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('raison'), 'error');
    });

    it('désactive les champs de fin quand la date est inconnue', () => {
        render(<PutInMaintenanceModal vehicleName="VL186" onClose={vi.fn()} onSuccess={vi.fn()} showToast={vi.fn()} />);
        fireEvent.click(screen.getByLabelText('Date de fin inconnue'));

        const endDateInput = document.querySelectorAll('input[type="date"]')[1] as HTMLInputElement;
        expect(endDateInput.disabled).toBe(true);
    });

    it('met le véhicule en maintenance et appelle onSuccess (happy path)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        const onSuccess = vi.fn();
        const onClose = vi.fn();
        const showToast = vi.fn();

        render(<PutInMaintenanceModal vehicleName="VL186" onClose={onClose} onSuccess={onSuccess} showToast={showToast} />);
        fireEvent.change(screen.getByPlaceholderText(/Révision périodique/), { target: { value: 'Contrôle technique' } });
        fireEvent.click(screen.getByRole('button', { name: 'Mettre en maintenance' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(onClose).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('Véhicule mis en maintenance avec succès', 'success');

        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.reason).toBe('Contrôle technique');
        expect(fetchMock).toHaveBeenCalledWith('/api/vehicles/VL186/maintenance-events', expect.objectContaining({ method: 'POST' }));
    });

    it('affiche une erreur via showToast si la requête échoue', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Véhicule déjà en maintenance' }), { status: 400 }));
        const showToast = vi.fn();

        render(<PutInMaintenanceModal vehicleName="VL186" onClose={vi.fn()} onSuccess={vi.fn()} showToast={showToast} />);
        fireEvent.change(screen.getByPlaceholderText(/Révision périodique/), { target: { value: 'Contrôle' } });
        fireEvent.click(screen.getByRole('button', { name: 'Mettre en maintenance' }));

        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Véhicule déjà en maintenance', 'error'));
    });

    it('appelle onClose au clic sur Annuler', () => {
        const onClose = vi.fn();
        render(<PutInMaintenanceModal vehicleName="VL186" onClose={onClose} onSuccess={vi.fn()} showToast={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onClose).toHaveBeenCalled();
    });
});
