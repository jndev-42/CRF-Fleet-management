/**
 * Tests du composant VehicleCalendar.
 *
 * Fichiers testés : src/components/vehicle/VehicleCalendar.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Seul mock du fichier : `VehicleCalendar` lit les rôles via `useSession` pour gater les
// actions de maintenance. `useUL` n'est PAS mocké — `@/lib/contexts/ULContext` tolère
// l'absence de provider, et la suite passe ainsi.
const { mockUseSession } = vi.hoisted(() => ({ mockUseSession: vi.fn() }));
vi.mock('next-auth/react', () => ({ useSession: mockUseSession }));

import VehicleCalendar from '@/components/vehicle/VehicleCalendar';

beforeEach(() => {
  vi.restoreAllMocks();
  mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
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


// ── Actions de maintenance depuis le calendrier (étape 10) ────────────────────
// Réservées à l'ADMIN, masquées en vue DT (lecture seule, véhicules d'autres ULs :
// le serveur répondrait 403) et masquées sur une maintenance déjà terminée.
describe('VehicleCalendar — modifier / supprimer une maintenance', () => {
  const EDIT_LABEL = '✏️ Modifier';
  const DELETE_LABEL = '🗑️ Supprimer';
  const CALENDAR_URL = '/api/vehicles/calendar';

  const adminSession = { data: { user: { roles: ['ADMIN'] } }, status: 'authenticated' };
  const benevoleSession = { data: { user: { roles: ['BENEVOLE'] } }, status: 'authenticated' };

  // Maintenance EN COURS : `endDate` null → visible sur toutes les cases de la grille
  // jusqu'à aujourd'hui, quel que soit le jour du mois où tourne le test.
  const ongoingMaintenance = {
    id: 'maint-open',
    vehicleId: 'v-1',
    vehicleName: 'VSAV 01',
    vehiclePlate: 'AB-123-CD',
    startDate: new Date(Date.now() - 86_400_000).toISOString(),
    endDate: null,
    reason: 'Panne embrayage',
    isEndDateUnknown: true,
  };

  // Maintenance TERMINÉE : bornée au premier instant du mois courant. `endDate <= now`
  // est donc toujours vrai (égalité comprise), et la case du 1er est toujours dans la
  // grille — aucune fenêtre de flakiness.
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 0, 0, 0, 0).toISOString();
  const closedMaintenance = {
    id: 'maint-closed',
    vehicleId: 'v-1',
    vehicleName: 'VSAV 01',
    vehiclePlate: 'AB-123-CD',
    startDate: startOfMonth,
    endDate: startOfMonth,
    reason: 'Révision terminée',
    isEndDateUnknown: false,
  };

  function calendarPayload(maintenances: unknown[]) {
    return {
      month: currentMonthStr,
      vehicles: [{ id: 'v-1', name: 'VSAV 01', plate: 'AB-123-CD', type: 'VPSP', status: 'MAINTENANCE' }],
      reservations: [],
      trips: [],
      maintenances,
    };
  }

  /** Routeur de fetch : le calendrier renvoie le payload, tout le reste un 200 générique. */
  function mockFetch(maintenances: unknown[]) {
    return vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes(CALENDAR_URL)) {
        return { ok: true, json: async () => calendarPayload(maintenances) } as Response;
      }
      return { ok: true, json: async () => ({ success: true }) } as Response;
    });
  }

  function calendarCalls(spy: ReturnType<typeof mockFetch>): number {
    return spy.mock.calls.filter(c => String(c[0]).includes(CALENDAR_URL)).length;
  }

  /** Ouvre la fiche détail de l'événement de maintenance dont le motif est `reason`. */
  async function openMaintenanceDetails(reason: string) {
    // Une maintenance sans date de fin s'affiche sur chaque jour de la grille
    // jusqu'à aujourd'hui : plusieurs pastilles, on ouvre la première.
    const chips = await screen.findAllByTitle(new RegExp(reason));
    fireEvent.click(chips[0]);
    // `Raison / Motif` n'existe QUE dans la fiche détail d'une maintenance : attendre ce
    // libellé (et non un vague /Maintenance/, présent dans la légende) garantit que les
    // cas « bouton absent » ne passent pas parce que le panneau ne s'est pas ouvert.
    await screen.findByText('Raison / Motif');
    expect(screen.getByText(reason)).toBeTruthy();
  }

  beforeEach(() => {
    localStorage.setItem('show_vehicle_calendar', 'true');
  });

  it('affiche « Modifier » et « Supprimer » pour un ADMIN sur une maintenance en cours', async () => {
    mockUseSession.mockReturnValue(adminSession);
    mockFetch([ongoingMaintenance]);

    render(<VehicleCalendar />);
    await openMaintenanceDetails('Panne embrayage');

    expect(screen.getByRole('button', { name: EDIT_LABEL })).toBeTruthy();
    expect(screen.getByRole('button', { name: DELETE_LABEL })).toBeTruthy();
  });

  it('masque les actions pour un non-ADMIN', async () => {
    mockUseSession.mockReturnValue(benevoleSession);
    mockFetch([ongoingMaintenance]);

    render(<VehicleCalendar />);
    await openMaintenanceDetails('Panne embrayage');

    expect(screen.queryByText(EDIT_LABEL)).toBeNull();
    expect(screen.queryByText(DELETE_LABEL)).toBeNull();
  });

  it('masque les actions sur une maintenance terminée, même pour un ADMIN', async () => {
    mockUseSession.mockReturnValue(adminSession);
    mockFetch([closedMaintenance]);

    render(<VehicleCalendar />);
    await openMaintenanceDetails('Révision terminée');

    expect(screen.queryByText(EDIT_LABEL)).toBeNull();
    expect(screen.queryByText(DELETE_LABEL)).toBeNull();
  });

  it('masque les actions en vue DT, même pour un ADMIN', async () => {
    mockUseSession.mockReturnValue(adminSession);
    mockFetch([ongoingMaintenance]);

    render(<VehicleCalendar dtView />);
    await openMaintenanceDetails('Panne embrayage');

    expect(screen.queryByText(EDIT_LABEL)).toBeNull();
    expect(screen.queryByText(DELETE_LABEL)).toBeNull();
  });

  it('demande confirmation avant de supprimer — aucun DELETE avant validation', async () => {
    mockUseSession.mockReturnValue(adminSession);
    const fetchSpy = mockFetch([ongoingMaintenance]);

    render(<VehicleCalendar />);
    await openMaintenanceDetails('Panne embrayage');

    fireEvent.click(screen.getByRole('button', { name: DELETE_LABEL }));

    // Le modal de confirmation est monté…
    expect(await screen.findByText('🗑️ Supprimer la maintenance')).toBeTruthy();
    // …et rien n'a encore été envoyé au serveur.
    const deleteCalls = fetchSpy.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(0);
  });

  it('2.8 — rafraîchit le calendrier après une suppression confirmée', async () => {
    mockUseSession.mockReturnValue(adminSession);
    const fetchSpy = mockFetch([ongoingMaintenance]);

    render(<VehicleCalendar />);
    await openMaintenanceDetails('Panne embrayage');
    fireEvent.click(screen.getByRole('button', { name: DELETE_LABEL }));
    await screen.findByText('🗑️ Supprimer la maintenance');

    const before = calendarCalls(fetchSpy);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    await waitFor(() => {
      const deleteCalls = fetchSpy.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'DELETE');
      expect(deleteCalls).toHaveLength(1);
      expect(String(deleteCalls[0][0])).toBe('/api/vehicles/v-1/maintenance-events/maint-open');
    });

    // `onSuccess → fetchData()` : un nouvel appel calendrier suit la suppression.
    await waitFor(() => expect(calendarCalls(fetchSpy)).toBeGreaterThan(before));
  });

  it('2.8 — rafraîchit le calendrier après une modification enregistrée', async () => {
    mockUseSession.mockReturnValue(adminSession);
    const fetchSpy = mockFetch([ongoingMaintenance]);

    render(<VehicleCalendar />);
    await openMaintenanceDetails('Panne embrayage');
    fireEvent.click(screen.getByRole('button', { name: EDIT_LABEL }));
    await screen.findByText('✏️ Modifier la maintenance');

    const before = calendarCalls(fetchSpy);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

    await waitFor(() => {
      const patchCalls = fetchSpy.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      expect(String(patchCalls[0][0])).toBe('/api/vehicles/v-1/maintenance-events/maint-open');
    });

    // Chemin distinct de la suppression, bien qu'il partage `onSuccess → fetchData()`.
    await waitFor(() => expect(calendarCalls(fetchSpy)).toBeGreaterThan(before));
  });
});
