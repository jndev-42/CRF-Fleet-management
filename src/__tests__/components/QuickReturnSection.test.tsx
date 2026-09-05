import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks hoistés ────────────────────────────────────────────────────────────
vi.mock('@/components/vehicle/modals/CheckInModal', () => ({
    default: ({ vehicle, trip, onSuccess }: {
        vehicle: { name: string };
        trip: { id: string };
        onSuccess: () => void;
    }) => (
        <div data-testid="checkin-modal" data-trip-id={trip.id}>
            {vehicle.name}
            <button type="button" data-testid="checkin-submit" onClick={onSuccess}>ok</button>
        </div>
    ),
}));

import QuickReturnSection from '@/app/vehicles/QuickReturnSection';
import type { DashboardVehicle } from '@/app/vehicles/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ME = 'me@dev.local';
const OTHER = 'someone.else@dev.local';

type DashboardTrip = DashboardVehicle['trips'][number];

function makeTrip(overrides: Partial<DashboardTrip> = {}): DashboardTrip {
    return {
        id: 'trip-1',
        driverName: 'Moi',
        driverEmail: ME,
        secondDriverName: null,
        secondDriverEmail: null,
        missionType: 'Transport',
        checkOutAt: new Date().toISOString(),
        ...overrides,
    };
}

/** Véhicule emprunté par ME par défaut — c'est le cas nominal de cette section. */
function makeVehicle(overrides: Partial<DashboardVehicle> = {}): DashboardVehicle {
    return {
        id: 'uuid-1',
        name: 'VL 186',
        type: 'VL',
        plate: 'AB-123-CD',
        status: 'IN_USE',
        parkingSpot: 'Baigneur',
        fuelLevel: 80,
        mileage: 10000,
        hasDSA: false,
        notes: null,
        vin: null,
        fuelType: 'Essence',
        transmission: 'Manuelle',
        trips: [makeTrip()],
        ...overrides,
    };
}

/** Payload d'hydratation `GET /api/vehicles/{name}` — forme `Vehicle`, trajets complets. */
function hydrated(overrides: Record<string, unknown> = {}) {
    return {
        id: 'uuid-1',
        name: 'VL 186',
        type: 'VL',
        plate: 'AB-123-CD',
        status: 'IN_USE',
        mileage: 10000,
        fuelLevel: 80,
        trips: [{
            id: 'trip-1',
            checkInAt: null,
            driverEmail: ME,
            secondDriverEmail: null,
            desinfResponsableId: null,
            desinfLotNumber: null,
        }],
        ...overrides,
    };
}

const mockFetch = vi.fn();

/** Route l'hydratation par nom de véhicule. `'reject'` simule une panne réseau. */
function routeFetch(hydrate: Record<string, unknown> | 'reject' | ((name: string) => Record<string, unknown>) = hydrated()) {
    mockFetch.mockImplementation((url: string) => {
        if (hydrate === 'reject') return Promise.reject(new Error('boom'));
        const name = decodeURIComponent(String(url).replace('/api/vehicles/', '').split('?')[0]);
        const body = typeof hydrate === 'function' ? hydrate(name) : hydrate;
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
}

function renderSection(overrides: Partial<React.ComponentProps<typeof QuickReturnSection>> = {}) {
    const onCheckInSuccess = vi.fn();
    const utils = render(
        <QuickReturnSection
            vehicles={[makeVehicle()]}
            currentUserEmail={ME}
            currentUserUlId="ul-1"
            isDtView={false}
            onCheckInSuccess={onCheckInSuccess}
            {...overrides}
        />,
    );
    return { ...utils, onCheckInSuccess };
}

function ctaButton() {
    return screen.getByRole('button', { name: /^Rendre/ }) as HTMLButtonElement;
}

beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('alert', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('QuickReturnSection — visibilité', () => {
    it('aucun emprunt en cours : rien dans le DOM, aucun fetch émis', () => {
        routeFetch();
        const { container } = renderSection({ vehicles: [] });

        expect(container.innerHTML).toBe('');
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('flotte en mission mais aucun trajet à soi : rien dans le DOM', () => {
        routeFetch();
        const { container } = renderSection({
            vehicles: [
                makeVehicle({ id: 'uuid-1', name: 'VL 1', trips: [makeTrip({ driverEmail: OTHER })] }),
                makeVehicle({ id: 'uuid-2', name: 'VL 2', status: 'AVAILABLE', trips: [] }),
            ],
        });

        expect(container.innerHTML).toBe('');
    });

    it('isDtView : rien dans le DOM, aucun fetch émis', () => {
        routeFetch();
        const { container } = renderSection({ isDtView: true });

        expect(container.innerHTML).toBe('');
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('second conducteur : la CTA apparaît', () => {
        routeFetch();
        renderSection({
            vehicles: [makeVehicle({ trips: [makeTrip({ driverEmail: OTHER, secondDriverEmail: ME })] })],
        });

        expect(ctaButton().textContent).toBe('↩️ Rendre VL 186');
    });
});

describe('QuickReturnSection — un seul véhicule emprunté', () => {
    it('clic unique : CheckInModal ouvert sans picker, hydratation par NOM et no-store', async () => {
        routeFetch();
        const user = userEvent.setup();
        renderSection();

        expect(ctaButton().textContent).toBe('↩️ Rendre VL 186');

        await user.click(ctaButton());

        await waitFor(() => expect(screen.getByTestId('checkin-modal')).toBeTruthy());
        // Aucun sélecteur intermédiaire n'a été rendu.
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryAllByTestId('picker-row')).toHaveLength(0);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.calls[0];
        expect(String(url)).toContain(encodeURIComponent('VL 186'));
        expect(String(url)).not.toContain('uuid-1');
        expect(init).toMatchObject({ cache: 'no-store' });
    });

    it('onSuccess de CheckInModal : onCheckInSuccess appelé une fois, modal fermé', async () => {
        routeFetch();
        const user = userEvent.setup();
        const { onCheckInSuccess } = renderSection();

        await user.click(ctaButton());
        await waitFor(() => expect(screen.getByTestId('checkin-modal')).toBeTruthy());

        fireEvent.click(screen.getByTestId('checkin-submit'));

        expect(onCheckInSuccess).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('checkin-modal')).toBeNull();
    });

    it('hydratation en échec réseau : alert, pas de modal, CTA redevenue cliquable', async () => {
        routeFetch('reject');
        const user = userEvent.setup();
        renderSection();

        await user.click(ctaButton());

        await waitFor(() => expect(globalThis.alert).toHaveBeenCalledWith('Impossible de charger le véhicule…'));
        expect(screen.queryByTestId('checkin-modal')).toBeNull();
        expect(ctaButton().disabled).toBe(false);
    });
});

describe('QuickReturnSection — plusieurs véhicules empruntés', () => {
    const TWO = [
        makeVehicle({ id: 'uuid-1', name: 'VL 186' }),
        makeVehicle({ id: 'uuid-2', name: 'VL 204', trips: [makeTrip({ id: 'trip-2' })] }),
    ];

    it('clic : picker ouvert avec ses libellés de retour, puis la sélection ouvre le modal', async () => {
        routeFetch((name) => hydrated({
            name,
            trips: [{ id: 'trip-2', checkInAt: null, desinfResponsableId: null, desinfLotNumber: null }],
        }));
        const user = userEvent.setup();
        renderSection({ vehicles: TWO });

        expect(ctaButton().textContent).toBe('↩️ Rendre un véhicule (2)');

        await user.click(ctaButton());

        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.getByText('↩️ Choisir le véhicule à rendre')).toBeTruthy();
        const rows = screen.getAllByTestId('picker-row');
        expect(rows.map(r => r.textContent)).toEqual([
            expect.stringContaining('VL 186'),
            expect.stringContaining('VL 204'),
        ]);
        expect(screen.queryByTestId('checkin-modal')).toBeNull();

        await user.click(rows[1]);

        await waitFor(() => expect(screen.getByTestId('checkin-modal')).toBeTruthy());
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(String(mockFetch.mock.calls[0][0])).toContain(encodeURIComponent('VL 204'));
        expect(screen.getByTestId('checkin-modal').getAttribute('data-trip-id')).toBe('trip-2');
    });

    it('le véhicule emprunté par un tiers n\'est pas listé', async () => {
        routeFetch();
        const user = userEvent.setup();
        renderSection({
            vehicles: [
                ...TWO,
                makeVehicle({ id: 'uuid-3', name: 'VL 999', trips: [makeTrip({ id: 'trip-3', driverEmail: OTHER })] }),
            ],
        });

        expect(ctaButton().textContent).toBe('↩️ Rendre un véhicule (2)');

        await user.click(ctaButton());
        expect(screen.getAllByTestId('picker-row')).toHaveLength(2);
        expect(screen.queryByText('VL 999')).toBeNull();
    });
});

describe('QuickReturnSection — trajet clos entre-temps', () => {
    it('plus de trajet actif à l\'hydratation : message, pas de modal, refresh déclenché', async () => {
        routeFetch(hydrated({
            status: 'AVAILABLE',
            trips: [{ id: 'trip-1', checkInAt: new Date().toISOString() }],
        }));
        const user = userEvent.setup();
        const { onCheckInSuccess } = renderSection();

        await user.click(ctaButton());

        await waitFor(() => expect(screen.getByText("Ce véhicule vient d'être rendu.")).toBeTruthy());
        expect(screen.queryByTestId('checkin-modal')).toBeNull();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(onCheckInSuccess).toHaveBeenCalledTimes(1);
    });

    it('aucun trajet du tout à l\'hydratation : même message', async () => {
        routeFetch(hydrated({ status: 'AVAILABLE', trips: [] }));
        const user = userEvent.setup();
        renderSection();

        await user.click(ctaButton());

        await waitFor(() => expect(screen.getByText("Ce véhicule vient d'être rendu.")).toBeTruthy());
        expect(screen.queryByTestId('checkin-modal')).toBeNull();
    });
});
