import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import IncidentReportModal from '@/components/vehicle/modals/IncidentReportModal';
import type { Vehicle } from '@/app/vehicles/[id]/types';

// ── Minimal vehicle fixture ───────────────────────────────────────────────────

const mockVehicle: Vehicle = {
    id: 'veh-1',
    name: 'VL186',
    type: 'VL',
    plate: 'HJ-269-FE',
    status: 'AVAILABLE',
    parkingSpot: 'Baigneur',
    fuelLevel: 80,
    mileage: 12000,
    hasDSA: false,
    desinfTracking: false,
    notes: null,
    vin: null,
    fuelType: 'Essence',
    maxFuelCapacity: null,
    maxBatteryCapacityKwh: null,
    lastDesinfDate: null,
    nextDesinfMaxDate: null,
    firstRegistrationDate: null,
    revisionKmInterval: null,
    revisionYearInterval: null,
    trips: [],
};

// ── Mock fetch ────────────────────────────────────────────────────────────────

beforeEach(() => {
    global.fetch = vi.fn();
});

function mockFetchSuccess(id = 'incident-123') {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
        if (url === '/api/incidents' || url.startsWith('/api/incidents/')) {
            return Promise.resolve({
                ok: true,
                json: async () => ({ success: true, id }),
            });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
    });
}

function mockFetchError(message = 'Erreur serveur') {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        json: async () => ({ error: message }),
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IncidentReportModal', () => {
    it('affiche le step initial GUIDELINES_PROMPT avec les 3 boutons', () => {
        render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={vi.fn()}
            />
        );

        expect(screen.getByText('🚨 Déclarer un incident')).toBeTruthy();
        expect(screen.getByText('Annuler')).toBeTruthy();
        expect(screen.getByText('Oui, voir les consignes')).toBeTruthy();
        expect(screen.getByText('Non, déclarer directement')).toBeTruthy();
    });

    it('click "Oui" → affiche les consignes + boutons Retour / Déclarer', () => {
        render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={vi.fn()}
            />
        );

        fireEvent.click(screen.getByText('Oui, voir les consignes'));

        expect(screen.getByText('📋 Consignes incident')).toBeTruthy();
        expect(screen.getByText('Consignes en cas d\'incident')).toBeTruthy();
        expect(screen.getByText('Retour')).toBeTruthy();
        expect(screen.getByText('🚨 Déclarer l\'incident')).toBeTruthy();
    });

    it('click "Non" → saute directement à TYPE_SELECTION après succès API', async () => {
        mockFetchSuccess('incident-abc');

        render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={vi.fn()}
            />
        );

        fireEvent.click(screen.getByText('Non, déclarer directement'));

        await waitFor(() => {
            expect(screen.getByText('🚨 Type d\'incident')).toBeTruthy();
        });
    });

    it('depuis GUIDELINES_VIEW, click "Déclarer" → TYPE_SELECTION après succès API', async () => {
        mockFetchSuccess('incident-xyz');

        render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={vi.fn()}
            />
        );

        // Aller sur la vue consignes
        fireEvent.click(screen.getByText('Oui, voir les consignes'));

        // Déclarer
        fireEvent.click(screen.getByText('🚨 Déclarer l\'incident'));

        await waitFor(() => {
            expect(screen.getByText('🚨 Type d\'incident')).toBeTruthy();
        });
    });

    it('click "Annuler" sur GUIDELINES_PROMPT appelle onClose', () => {
        const onClose = vi.fn();
        render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={onClose}
            />
        );

        fireEvent.click(screen.getByText('Annuler'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('click "Annuler" sur GUIDELINES_VIEW appelle onClose', () => {
        const onClose = vi.fn();
        render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={onClose}
            />
        );

        fireEvent.click(screen.getByText('Oui, voir les consignes'));
        fireEvent.click(screen.getByText('Annuler'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('click "Fermer" sur TYPE_SELECTION appelle onClose', async () => {
        mockFetchSuccess();
        const onClose = vi.fn();

        render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={onClose}
            />
        );

        fireEvent.click(screen.getByText('Non, déclarer directement'));

        await waitFor(() => screen.getByText('Fermer'));
        fireEvent.click(screen.getByText('Fermer'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('click sur l\'overlay appelle onClose', () => {
        const onClose = vi.fn();
        const { container } = render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={onClose}
            />
        );

        // L'overlay est le premier div
        const overlay = container.firstChild as HTMLElement;
        fireEvent.click(overlay);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('click dans la modal ne propage pas le click à l\'overlay', () => {
        const onClose = vi.fn();
        const { container } = render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={onClose}
            />
        );

        const modal = container.querySelector('.modal') as HTMLElement;
        fireEvent.click(modal);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('affiche un message d\'erreur si l\'API échoue', async () => {
        mockFetchError('Véhicule introuvable');

        render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={vi.fn()}
            />
        );

        // En mode DRAFT automatique lors du clic sur déclarer
        fireEvent.click(screen.getByText('Non, déclarer directement'));

        await waitFor(() => {
            expect(screen.getByText('Véhicule introuvable')).toBeTruthy();
        });

        // On reste sur le même step
        expect(screen.getByText('🚨 Déclarer un incident')).toBeTruthy();
    });

    it('cocher une victime affiche le champ de gravité avec la variable de thème', async () => {
        mockFetchSuccess();

        render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={vi.fn()}
            />
        );

        fireEvent.click(screen.getByText('Non, déclarer directement'));
        await waitFor(() => screen.getByText('Accident / Incident de circulation'));
        fireEvent.click(screen.getByText('Accident / Incident de circulation'));

        await waitFor(() => screen.getByText('Victime CRF'));
        expect(screen.queryByText('Urgence absolue / Grave')).toBeNull();

        fireEvent.click(screen.getByLabelText('Victime CRF'));

        const severityLabel = await screen.findByText('Urgence absolue / Grave');
        expect(severityLabel.closest('label')?.getAttribute('style')).toContain('var(--status-maintenance)');

        // Coche aussi la case de gravité elle-même (déclenche son onChange).
        fireEvent.click(screen.getByLabelText('Urgence absolue / Grave'));
        expect((screen.getByLabelText('Urgence absolue / Grave') as HTMLInputElement).checked).toBe(true);
    });

    it('TYPE_SELECTION affiche les options disponibles', async () => {
        mockFetchSuccess();

        render(
            <IncidentReportModal
                vehicle={mockVehicle}
                onClose={vi.fn()}
            />
        );

        fireEvent.click(screen.getByText('Non, déclarer directement'));

        await waitFor(() => screen.getByText('Accident / Incident de circulation'));

        expect(screen.getByText('Accident / Incident de circulation')).toBeTruthy();
        expect(screen.getByText('Flash radar / Infraction')).toBeTruthy();
    });
});
