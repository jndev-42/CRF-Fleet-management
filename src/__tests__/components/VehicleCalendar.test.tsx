/**
 * Tests du composant VehicleCalendar.
 *
 * Fichiers testés : src/components/vehicle/VehicleCalendar.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VehicleCalendar from '@/components/vehicle/VehicleCalendar';

beforeEach(() => {
  vi.restoreAllMocks();
});

const mockCalendarData = {
  month: '2026-07',
  vehicles: [
    { id: 'v-1', name: 'VSAV 01', plate: 'AB-123-CD', type: 'VPSP', status: 'AVAILABLE' },
  ],
  reservations: [
    {
      id: 'res-1',
      vehicleId: 'v-1',
      vehicleName: 'VSAV 01',
      vehiclePlate: 'AB-123-CD',
      userEmail: 'jean@crf.fr',
      userName: 'Jean Dupont',
      startTime: '2026-07-10T10:00:00.000Z',
      endTime: '2026-07-10T18:00:00.000Z',
      reason: 'Urgence sanitaire',
      status: 'VALIDATED',
      createdAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  trips: [
    {
      id: 'trip-ongoing-1',
      vehicleId: 'v-1',
      vehicleName: 'VSAV 01',
      vehiclePlate: 'AB-123-CD',
      driverName: 'Marie Curie',
      secondDriverName: null,
      missionType: 'Poste de secours',
      missionName: 'Festival',
      checkOutAt: '2026-07-15T08:00:00.000Z',
      checkInAt: null,
      isOngoing: true,
      createdAt: '2026-07-15T08:00:00.000Z',
    },
  ],
};

describe('VehicleCalendar Component', () => {
  it('renders title, controls, legend, and fetches data', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockCalendarData,
    } as Response);

    render(<VehicleCalendar />);

    expect(screen.getByText('Planning des véhicules')).toBeTruthy();
    expect(screen.getByText('Réservations & Emprunts par mois')).toBeTruthy();

    // Legend items
    expect(screen.getByText(/Réservation \(Jaune\)/)).toBeTruthy();
    expect(screen.getByText(/Emprunt effectué \(Vert\)/)).toBeTruthy();
    expect(screen.getByText(/Emprunt en cours \(Vert pointillés\)/)).toBeTruthy();

    // Wait for fetch & data rendering
    await waitFor(() => {
      expect(screen.getAllByText(/Jean Dupont/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/En cours/).length).toBeGreaterThan(0);
    });
  });

  it('allows month navigation', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockCalendarData,
    } as Response);

    render(<VehicleCalendar />);

    const prevBtn = screen.getByLabelText('Mois précédent');
    const nextBtn = screen.getByLabelText('Mois suivant');

    fireEvent.click(nextBtn);
    expect(global.fetch).toHaveBeenCalled();

    fireEvent.click(prevBtn);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('opens details modal when an event is clicked', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockCalendarData,
    } as Response);

    render(<VehicleCalendar />);

    await waitFor(() => {
      expect(screen.getAllByText(/Marie Curie/).length).toBeGreaterThan(0);
    });

    const ongoingEvent = screen.getAllByText(/Marie Curie/)[0].closest('div');
    expect(ongoingEvent).toBeTruthy();

    fireEvent.click(ongoingEvent!);

    await waitFor(() => {
      expect(screen.getAllByText(/Emprunt en cours/).length).toBeGreaterThan(0);
      expect(screen.getByText('Poste de secours')).toBeTruthy();
    });
  });
});
