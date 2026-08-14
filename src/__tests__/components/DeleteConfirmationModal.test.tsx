import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DeleteConfirmationModal from '@/components/vehicle/modals/DeleteConfirmationModal';
import type { Vehicle } from '@/app/vehicles/[id]/types';

const mockVehicle = { name: 'VL186', trips: [{}, {}] } as Vehicle;

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('DeleteConfirmationModal', () => {
    it('désactive le bouton de suppression tant que le nom ne correspond pas', () => {
        render(<DeleteConfirmationModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);
        expect((screen.getByRole('button', { name: 'Confirmer la suppression' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('active le bouton une fois le nom saisi correctement', () => {
        render(<DeleteConfirmationModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('VL186'), { target: { value: 'VL186' } });
        expect((screen.getByRole('button', { name: 'Confirmer la suppression' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('supprime le véhicule et appelle onSuccess (happy path)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        const onSuccess = vi.fn();

        render(<DeleteConfirmationModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={onSuccess} />);
        fireEvent.change(screen.getByPlaceholderText('VL186'), { target: { value: 'VL186' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(fetchMock).toHaveBeenCalledWith('/api/vehicles/VL186', { method: 'DELETE' });
    });

    it('affiche une alerte si la suppression échoue', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Interdit' }), { status: 403 }));
        render(<DeleteConfirmationModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);

        fireEvent.change(screen.getByPlaceholderText('VL186'), { target: { value: 'VL186' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

        await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Interdit'));
    });

    it('appelle onClose au clic sur Annuler', () => {
        const onClose = vi.fn();
        render(<DeleteConfirmationModal vehicle={mockVehicle} onClose={onClose} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onClose).toHaveBeenCalled();
    });
});
