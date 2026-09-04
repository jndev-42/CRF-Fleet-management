import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import IncidentHistoryModal from '@/components/vehicle/modals/IncidentHistoryModal';
import type { Vehicle } from '@/app/vehicles/[id]/types';

const mockVehicle: Vehicle = {
    id: 'VL001', name: 'VL186', type: 'VL', plate: 'HJ-269-FE', status: 'AVAILABLE',
    parkingSpot: 'Place A-1', fuelLevel: 60, mileage: 12000, hasDSA: false, desinfTracking: false,
    notes: '', vin: null, fuelType: 'Essence', transmission: null, maxFuelCapacity: 50, maxBatteryCapacityKwh: null,
    lastDesinfDate: null, nextDesinfMaxDate: null, firstRegistrationDate: '2022-01-15',
    revisionKmInterval: 15000, revisionYearInterval: 1, trips: [],
};

const submittedIncident = {
    id: 'inc-1', vehicleId: 'VL001', userId: 'u1', userName: 'Jean Dupont', userEmail: 'jean@test.com',
    tripId: null, reservationId: null, type: 'FLASH' as const, status: 'SUBMITTED' as const,
    occurredAt: '2026-01-15T10:00:00', createdAt: '2026-01-15T10:00:00', submittedAt: '2026-01-15T10:05:00', canEdit: false,
};

const draftIncident = {
    id: 'inc-2', vehicleId: 'VL001', userId: 'u1', userName: 'Jean Dupont', userEmail: 'jean@test.com',
    tripId: null, reservationId: null, type: null, status: 'DRAFT' as const,
    occurredAt: null, createdAt: '2026-01-15T10:00:00', submittedAt: null, canEdit: true,
};

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('IncidentHistoryModal', () => {
    it('affiche la liste des incidents (happy path)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ incidents: [submittedIncident, draftIncident] }), { status: 200 }));
        render(<IncidentHistoryModal vehicle={mockVehicle} onClose={vi.fn()} onEditDraft={vi.fn()} />);

        expect(await screen.findByText('📸 Flash radar')).toBeTruthy();
        expect(screen.getByText('Validé')).toBeTruthy();
        expect(screen.getByText('Brouillon')).toBeTruthy();
    });

    it('affiche un état vide sans incident', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ incidents: [] }), { status: 200 }));
        render(<IncidentHistoryModal vehicle={mockVehicle} onClose={vi.fn()} onEditDraft={vi.fn()} />);
        expect(await screen.findByText('Aucun incident enregistré pour ce véhicule.')).toBeTruthy();
    });

    it('affiche une erreur de connexion si le chargement échoue', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
        render(<IncidentHistoryModal vehicle={mockVehicle} onClose={vi.fn()} onEditDraft={vi.fn()} />);
        expect(await screen.findByText('Erreur de connexion')).toBeTruthy();
    });

    it('continue l\'édition d\'un brouillon', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ incidents: [draftIncident] }), { status: 200 }));
        const onEditDraft = vi.fn();
        render(<IncidentHistoryModal vehicle={mockVehicle} onClose={vi.fn()} onEditDraft={onEditDraft} />);

        fireEvent.click(await screen.findByText('✏️ Continuer'));
        expect(onEditDraft).toHaveBeenCalledWith('inc-2');
    });

    it('supprime un brouillon après confirmation', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ incidents: [draftIncident] }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ incidents: [] }), { status: 200 }));
        vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);

        render(<IncidentHistoryModal vehicle={mockVehicle} onClose={vi.fn()} onEditDraft={vi.fn()} />);
        fireEvent.click(await screen.findByText('🗑️'));

        expect(window.confirm).toHaveBeenCalled();
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/incidents/inc-2', { method: 'DELETE' }));
    });

    it('n\'est pas masquée aux technologies d\'assistance (pas d\'aria-hidden sur l\'overlay)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ incidents: [] }), { status: 200 }));
        const { container } = render(<IncidentHistoryModal vehicle={mockVehicle} onClose={vi.fn()} onEditDraft={vi.fn()} />);
        await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
        expect(container.querySelector('.modal-overlay')?.getAttribute('aria-hidden')).toBeNull();
    });
});
