import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DesinfHistoryModal from '@/components/vehicle/modals/DesinfHistoryModal';

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('DesinfHistoryModal', () => {
    it('affiche un état de chargement puis les désinfections (happy path)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            desinfections: [
                { id: 'd1', checkInAt: '2026-01-15T10:00:00.000Z', desinfType: 'complète', desinfResponsable: 'Jean', desinfLotNumber: 'LOT-1', driverName: 'Marie' },
            ],
        }), { status: 200 }));

        render(<DesinfHistoryModal vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);
        expect(screen.getByText('Chargement...')).toBeTruthy();

        expect(await screen.findByText('✨ Complète')).toBeTruthy();
        expect(screen.getByText('LOT-1')).toBeTruthy();
        expect(screen.getByText('Marie')).toBeTruthy();
    });

    it('affiche un état vide sans désinfection', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ desinfections: [] }), { status: 200 }));
        render(<DesinfHistoryModal vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);
        expect(await screen.findByText('Aucune désinfection enregistrée')).toBeTruthy();
    });

    it('affiche une erreur générique si la requête échoue (statut HTTP non-ok)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Véhicule non trouvé' }), { status: 404 }));
        render(<DesinfHistoryModal vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);
        expect(await screen.findByText('Erreur de connexion')).toBeTruthy();
    });

    it('affiche une erreur de connexion en cas d\'exception réseau', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
        render(<DesinfHistoryModal vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);
        expect(await screen.findByText('Erreur de connexion')).toBeTruthy();
    });

    it('n\'est pas masquée aux technologies d\'assistance (pas d\'aria-hidden sur l\'overlay)', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ desinfections: [] }), { status: 200 }));
        const { container } = render(<DesinfHistoryModal vehicleId="VL001" vehicleName="VL186" onClose={vi.fn()} />);
        await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
        expect(container.querySelector('.modal-overlay')?.getAttribute('aria-hidden')).toBeNull();
    });
});
