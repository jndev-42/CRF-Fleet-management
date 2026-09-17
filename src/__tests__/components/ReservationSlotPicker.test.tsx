import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ReservationSlotPicker from '@/components/vehicle/ReservationSlotPicker';

const mockFetch = vi.fn();

/** Payload de `GET /api/vehicles/calendar`, par mois demandé. */
function routeCalendar(byMonth: Record<string, {
    reservations?: unknown[];
    trips?: unknown[];
    maintenances?: unknown[];
}> = {}, opts: { reject?: boolean } = {}) {
    mockFetch.mockImplementation((url: string) => {
        if (opts.reject) return Promise.reject(new Error('boom'));
        const month = new URL(String(url), 'http://localhost').searchParams.get('month') ?? '';
        const data = byMonth[month] ?? {};
        return Promise.resolve(new Response(JSON.stringify({
            month,
            vehicles: [],
            reservations: data.reservations ?? [],
            trips: data.trips ?? [],
            maintenances: data.maintenances ?? [],
        }), { status: 200 }));
    });
}

function renderPicker(overrides: Partial<React.ComponentProps<typeof ReservationSlotPicker>> = {}) {
    const onSelectRange = vi.fn();
    const utils = render(
        <ReservationSlotPicker
            vehicleId="veh-1"
            startDate=""
            endDate=""
            onSelectRange={onSelectRange}
            {...overrides}
        />,
    );
    return { ...utils, onSelectRange };
}

function day(key: string): HTMLButtonElement {
    return document.querySelector(`[data-day="${key}"]`) as HTMLButtonElement;
}

beforeEach(() => {
    // Date figée en milieu de mois : « hier / demain » restent dans le mois courant.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 10, 0, 0)); // 15 juin 2026
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('ReservationSlotPicker — chargement de l\'occupation', () => {
    it('appelle /api/vehicles/calendar filtré par véhicule et par mois courant', async () => {
        routeCalendar();
        renderPicker();

        await waitFor(() => expect(mockFetch).toHaveBeenCalled());
        expect(String(mockFetch.mock.calls[0][0])).toBe('/api/vehicles/calendar?vehicleId=veh-1&month=2026-06');
    });

    it('marque comme occupés les jours couverts par une réservation, un emprunt et une maintenance', async () => {
        routeCalendar({
            '2026-06': {
                reservations: [{
                    startTime: new Date(2026, 5, 17, 9, 0).toISOString(),
                    endTime: new Date(2026, 5, 18, 18, 0).toISOString(),
                    userName: 'Alice',
                    status: 'VALIDATED',
                }],
                trips: [{
                    checkOutAt: new Date(2026, 5, 20, 8, 0).toISOString(),
                    checkInAt: null,
                    driverName: 'Bob',
                }],
                maintenances: [{ startDate: '2026-06-24', endDate: '2026-06-25', reason: 'Révision' }],
            },
        });
        renderPicker();

        await waitFor(() => expect(day('2026-06-17').dataset.busy).toBe('true'));
        expect(day('2026-06-18').dataset.busy).toBe('true');   // réservation multi-jours
        expect(day('2026-06-19').dataset.busy).toBe('false');  // aucun créneau
        expect(day('2026-06-20').dataset.busy).toBe('true');   // emprunt en cours
        expect(day('2026-06-24').dataset.busy).toBe('true');   // maintenance
        expect(day('2026-06-25').dataset.busy).toBe('true');

        expect(day('2026-06-17').title).toContain('Réservation — Alice');
        expect(day('2026-06-20').title).toContain('Emprunt — Bob');
        expect(day('2026-06-24').title).toContain('Maintenance — Révision');
    });

    it('réservation PENDING : signalée comme telle dans l\'infobulle', async () => {
        routeCalendar({
            '2026-06': {
                reservations: [{
                    startTime: new Date(2026, 5, 17, 9, 0).toISOString(),
                    endTime: new Date(2026, 5, 17, 12, 0).toISOString(),
                    userName: 'Alice',
                    status: 'PENDING',
                }],
            },
        });
        renderPicker();

        await waitFor(() => expect(day('2026-06-17').title).toContain('(en attente)'));
    });

    it('fetch en échec : fail-open, calendrier rendu sans occupation, aucun crash', async () => {
        routeCalendar({}, { reject: true });
        renderPicker();

        await waitFor(() => expect(screen.queryByText(/Chargement de l/)).toBeNull());
        expect(day('2026-06-17').dataset.busy).toBe('false');
    });
});

describe('ReservationSlotPicker — navigation multi-mois', () => {
    it('🔴 mois suivant : nouvel appel avec le paramètre `month` correspondant', async () => {
        routeCalendar({
            '2026-07': { maintenances: [{ startDate: '2026-07-06', endDate: null, reason: 'Carrosserie' }] },
        });
        renderPicker();

        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));

        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
        expect(String(mockFetch.mock.calls[1][0])).toContain('month=2026-07');
        await waitFor(() => expect(day('2026-07-06')?.dataset.busy).toBe('true'));
    });

    it('retour sur un mois déjà chargé : aucun appel supplémentaire (mémoïsation)', async () => {
        routeCalendar();
        renderPicker();

        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));
        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
        fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }));

        await waitFor(() => expect(day('2026-06-17')).toBeTruthy());
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('mois précédent : navigation possible vers le passé, jours passés désactivés', async () => {
        routeCalendar();
        renderPicker();

        await waitFor(() => expect(day('2026-06-14')).toBeTruthy());
        expect(day('2026-06-14').disabled).toBe(true);  // hier
        expect(day('2026-06-15').disabled).toBe(false); // aujourd'hui
        expect(day('2026-06-16').disabled).toBe(false); // demain
    });
});

describe('ReservationSlotPicker — sélection de plage', () => {
    it('premier clic : plage d\'un seul jour', async () => {
        routeCalendar();
        const { onSelectRange } = renderPicker();

        await waitFor(() => expect(day('2026-06-17')).toBeTruthy());
        fireEvent.click(day('2026-06-17'));

        expect(onSelectRange).toHaveBeenCalledWith('2026-06-17', '2026-06-17');
    });

    it('second clic sur un jour postérieur : la plage s\'étend', async () => {
        routeCalendar();
        const { onSelectRange } = renderPicker({ startDate: '2026-06-17', endDate: '2026-06-17' });

        await waitFor(() => expect(day('2026-06-20')).toBeTruthy());
        fireEvent.click(day('2026-06-20'));

        expect(onSelectRange).toHaveBeenCalledWith('2026-06-17', '2026-06-20');
    });

    it('clic antérieur au début courant : la plage repart de ce jour', async () => {
        routeCalendar();
        const { onSelectRange } = renderPicker({ startDate: '2026-06-20', endDate: '2026-06-20' });

        await waitFor(() => expect(day('2026-06-17')).toBeTruthy());
        fireEvent.click(day('2026-06-17'));

        expect(onSelectRange).toHaveBeenCalledWith('2026-06-17', '2026-06-17');
    });

    it('plage déjà complète : un nouveau clic repart de zéro', async () => {
        routeCalendar();
        const { onSelectRange } = renderPicker({ startDate: '2026-06-17', endDate: '2026-06-20' });

        await waitFor(() => expect(day('2026-06-25')).toBeTruthy());
        fireEvent.click(day('2026-06-25'));

        expect(onSelectRange).toHaveBeenCalledWith('2026-06-25', '2026-06-25');
    });

    it('les jours de la plage sélectionnée sont marqués `aria-pressed`', async () => {
        routeCalendar();
        renderPicker({ startDate: '2026-06-17', endDate: '2026-06-19' });

        await waitFor(() => expect(day('2026-06-17')).toBeTruthy());
        expect(day('2026-06-17').getAttribute('aria-pressed')).toBe('true');
        expect(day('2026-06-18').getAttribute('aria-pressed')).toBe('true');
        expect(day('2026-06-19').getAttribute('aria-pressed')).toBe('true');
        expect(day('2026-06-20').getAttribute('aria-pressed')).toBe('false');
    });

    it('un jour occupé reste cliquable : le serveur seul arbitre les chevauchements', async () => {
        routeCalendar({
            '2026-06': {
                reservations: [{
                    startTime: new Date(2026, 5, 17, 9, 0).toISOString(),
                    endTime: new Date(2026, 5, 17, 12, 0).toISOString(),
                    userName: 'Alice',
                    status: 'VALIDATED',
                }],
            },
        });
        const { onSelectRange } = renderPicker();

        await waitFor(() => expect(day('2026-06-17').dataset.busy).toBe('true'));
        expect(day('2026-06-17').disabled).toBe(false);

        fireEvent.click(day('2026-06-17'));
        expect(onSelectRange).toHaveBeenCalledWith('2026-06-17', '2026-06-17');
    });
});
