import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DisconnectVehicleModal from '@/components/vehicle/modals/DisconnectVehicleModal';

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('DisconnectVehicleModal', () => {
    it('DELETE sur l\'UUID du véhicule puis onDisconnected', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
        const onDisconnected = vi.fn();

        render(
            <DisconnectVehicleModal
                vehicleId="uuid-1"
                vehicleName="VL186"
                onClose={vi.fn()}
                onDisconnected={onDisconnected}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Déconnecter' }));

        await waitFor(() => expect(onDisconnected).toHaveBeenCalled());
        expect(fetchMock).toHaveBeenCalledWith('/api/vehicles/uuid-1/connection', { method: 'DELETE' });
    });

    it('erreur serveur : message affiché, modale ouverte', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ error: 'Droits insuffisants' }), { status: 403 }),
        );
        const onClose = vi.fn();

        render(
            <DisconnectVehicleModal
                vehicleId="uuid-1"
                vehicleName="VL186"
                onClose={onClose}
                onDisconnected={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Déconnecter' }));

        expect(await screen.findByText('Droits insuffisants')).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('appelle onClose au clic sur Annuler', () => {
        const onClose = vi.fn();
        render(
            <DisconnectVehicleModal
                vehicleId="uuid-1"
                vehicleName="VL186"
                onClose={onClose}
                onDisconnected={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onClose).toHaveBeenCalled();
    });
});
