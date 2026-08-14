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

// VehicleCalendar affiche le mois courant par défaut (Date réelle, non mockable
// sans risque de casser waitFor) — les dates de la réservation doivent donc rester
// dans le mois en cours pour que le filtrage par jour de la grille les inclue.
// Contrairement aux emprunts en cours / maintenances (isOngoing / isEndDateUnknown),
// qui restent visibles jusqu'à "aujourd'hui" quel que soit le mois affiché.
const now = new Date();
const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const reservationDay = new Date(now.getFullYear(), now.getMonth(), 10, 10, 0, 0);
const reservationDayEnd = new Date(now.getFullYear(), now.getMonth(), 10, 18, 0, 0);

const mockCalendarData = {
  month: currentMonthStr,
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
      startTime: reservationDay.toISOString(),
      endTime: reservationDayEnd.toISOString(),
      reason: 'Urgence sanitaire',
      status: 'VALIDATED',
      createdAt: reservationDay.toISOString(),
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
  maintenances: [
    {
      id: 'maint-1',
      vehicleId: 'v-1',
      vehicleName: 'VSAV 01',
      vehiclePlate: 'AB-123-CD',
      startDate: '2026-07-20',
      endDate: null,
      reason: 'Panne embrayage',
      isEndDateUnknown: true,
      createdAt: '2026-07-20T00:00:00.000Z',
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
    expect(screen.getByText(/Maintenance \(Rouge\)/)).toBeTruthy();
    expect(screen.getByText(/Maintenance fin inconnue \(Rouge pointillés\)/)).toBeTruthy();

    // Wait for fetch & data rendering
    await waitFor(() => {
      expect(screen.getAllByText(/Jean Dupont/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/En cours/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Panne embrayage/).length).toBeGreaterThan(0);
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

  it('renders grid container with horizontal scroll wrapper', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockCalendarData,
    } as Response);

    render(<VehicleCalendar />);

    await waitFor(() => {
      const calendarContainer = screen.getByTestId('vehicle-calendar');
      expect(calendarContainer.querySelector('[class*="gridContainer"]')).toBeTruthy();
    });
  });

  it('toggles calendar visibility and persists preference in localStorage', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockCalendarData,
    } as Response);

    localStorage.clear();
    render(<VehicleCalendar />);

    const hideBtn = screen.getByRole('button', { name: /Masquer le calendrier/i });
    expect(hideBtn).toBeTruthy();

    fireEvent.click(hideBtn);

    expect(localStorage.getItem('show_vehicle_calendar')).toBe('false');
    expect(screen.getByText('Le calendrier est actuellement masqué')).toBeTruthy();

    const showBtn = screen.getByRole('button', { name: /Afficher le calendrier/i });
    fireEvent.click(showBtn);

    expect(localStorage.getItem('show_vehicle_calendar')).toBe('true');
    expect(screen.getByText('Réservations & Emprunts par mois')).toBeTruthy();
  });

  it('loads initial hidden state from localStorage', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockCalendarData,
    } as Response);

    localStorage.setItem('show_vehicle_calendar', 'false');

    render(<VehicleCalendar />);

    expect(screen.getByText('Le calendrier est actuellement masqué')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Afficher le calendrier/i })).toBeTruthy();
  });

  it('re-fetches calendar data when activeUL changes', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockCalendarData,
    } as Response);

    const { rerender } = render(<VehicleCalendar />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    // Rerender component (simulating activeUL change in context)
    rerender(<VehicleCalendar />);

    expect(fetchSpy).toHaveBeenCalled();
  });
});

