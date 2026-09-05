import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks hoistés ────────────────────────────────────────────────────────────
const mockCheckOutSuccess = vi.fn();
vi.mock('@/components/vehicle/modals/CheckOutModal', () => ({
    default: ({ vehicle, onSuccess }: { vehicle: { name: string }; onSuccess: () => void }) => (
        <div data-testid="checkout-modal">
            {vehicle.name}
            <button type="button" data-testid="checkout-submit" onClick={onSuccess}>ok</button>
        </div>
    ),
}));

import QuickBorrowSection from '@/app/vehicles/QuickBorrowSection';
import type { CalendarReservation } from '@/app/vehicles/useBorrowEligibility';
import type { DashboardVehicle } from '@/app/vehicles/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ME = 'me@dev.local';
const OTHER = 'someone.else@dev.local';

function makeVehicle(overrides: Partial<DashboardVehicle> = {}): DashboardVehicle {
    return {
        id: 'uuid-1',
        name: 'VL 186',
        type: 'VL',
        plate: 'AB-123-CD',
        status: 'AVAILABLE',
        parkingSpot: 'Baigneur',
        fuelLevel: 80,
        mileage: 10000,
        hasDSA: false,
        notes: null,
        vin: null,
        fuelType: 'Essence',
        transmission: 'Manuelle',
        trips: [],
        ...overrides,
    };
}

function reservation(overrides: Partial<CalendarReservation> = {}): CalendarReservation {
    const now = Date.now();
    return {
        vehicleId: 'uuid-1',
        userEmail: OTHER,
        startTime: new Date(now - 3600_000).toISOString(),
        endTime: new Date(now + 3600_000).toISOString(),
        status: 'VALIDATED',
        ...overrides,
    };
}

const NEVER = new Promise<Response>(() => { /* jamais résolue */ });

const mockFetch = vi.fn();

/** Route les appels par URL. `'pending'` laisse la promesse en suspens, `'reject'` la rejette. */
function routeFetch(opts: {
    license?: { blocked: boolean } | 'pending' | 'reject';
    reservations?: CalendarReservation[] | 'pending' | 'reject';
    hydrate?: Record<string, unknown> | 'reject';
} = {}) {
    const { license = { blocked: false }, reservations = [], hydrate } = opts;

    mockFetch.mockImplementation((url: string) => {
        const href = String(url);
        if (href.startsWith('/api/me/license-check')) {
            if (license === 'pending') return NEVER;
            if (license === 'reject') return Promise.reject(new Error('boom'));
            return Promise.resolve(new Response(JSON.stringify(license), { status: 200 }));
        }
        if (href.startsWith('/api/vehicles/calendar')) {
            if (reservations === 'pending') return NEVER;
            if (reservations === 'reject') return Promise.reject(new Error('boom'));
            return Promise.resolve(new Response(
                JSON.stringify({ vehicles: [], reservations, trips: [], maintenances: [] }),
                { status: 200 },
            ));
        }
        // hydratation GET /api/vehicles/{name}
        if (hydrate === 'reject') return Promise.reject(new Error('boom'));
        return Promise.resolve(new Response(
            JSON.stringify(hydrate ?? { ...makeVehicle(), trips: [] }),
            { status: 200 },
        ));
    });
}

function renderSection(overrides: Partial<React.ComponentProps<typeof QuickBorrowSection>> = {}) {
    const onCheckOutSuccess = mockCheckOutSuccess;
    const utils = render(
        <QuickBorrowSection
            vehicles={[makeVehicle()]}
            userRoles={['CHVL']}
            currentUserEmail={ME}
            isDtView={false}
            vehiclesLoading={false}
            onCheckOutSuccess={onCheckOutSuccess}
            {...overrides}
        />,
    );
    return { ...utils, onCheckOutSuccess };
}

function ctaButton() {
    return screen.getByRole('button', { name: 'Emprunter un véhicule' }) as HTMLButtonElement;
}

async function waitForCta(label: string) {
    await waitFor(() => expect(ctaButton().textContent).toBe(label));
}

beforeEach(() => {
    mockFetch.mockReset();
    mockCheckOutSuccess.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('alert', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('QuickBorrowSection — fenêtre de chargement', () => {
    it('🔴 calendar et license-check en attente : CTA LOADING et désactivée, aucun véhicule listé', async () => {
        routeFetch({ license: 'pending', reservations: 'pending' });
        const user = userEvent.setup();

        renderSection({
            vehicles: [
                makeVehicle({ id: 'uuid-1', name: 'VL 1' }),
                makeVehicle({ id: 'uuid-2', name: 'VL 2' }),
                makeVehicle({ id: 'uuid-3', name: 'VL 3' }),
                makeVehicle({ id: 'uuid-4', name: 'VL 4' }),
                makeVehicle({ id: 'uuid-5', name: 'VL 5' }),
            ],
        });

        const button = ctaButton();
        expect(button.textContent).toBe('🚗 Emprunter…');
        expect(button.disabled).toBe(true);

        await user.click(button);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryAllByTestId('picker-row')).toHaveLength(0);
    });

    it('vehicles: [] : CTA désactivée, message flotte vide, aucun fetch émis', async () => {
        routeFetch();
        renderSection({ vehicles: [] });

        expect(ctaButton().disabled).toBe(true);
        expect(screen.getByText("Aucun véhicule n'est rattaché à votre Unité Locale.")).toBeTruthy();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('isDtView : rien dans le DOM, aucun fetch émis', () => {
        routeFetch();
        const { container } = renderSection({ isDtView: true });

        expect(container.innerHTML).toBe('');
        expect(mockFetch).not.toHaveBeenCalled();
    });
});

describe('QuickBorrowSection — filtrage du picker', () => {
    const FLEET = [
        makeVehicle({ id: 'uuid-1', name: 'VL 1' }),
        makeVehicle({ id: 'uuid-2', name: 'VL 2', status: 'IN_USE' }),
        makeVehicle({ id: 'uuid-3', name: 'VPSP 3', type: 'VPSP' }),
        makeVehicle({ id: 'uuid-4', name: 'VL 4' }),
        makeVehicle({ id: 'uuid-5', name: 'VL 5' }),
    ];

    it('exclut IN_USE, VPSP pour un CHVL, et le véhicule réservé maintenant par un tiers', async () => {
        routeFetch({ reservations: [reservation({ vehicleId: 'uuid-4' })] });
        const user = userEvent.setup();
        renderSection({ vehicles: FLEET });

        await waitForCta('🚗 Emprunter (2 dispo)');

        await user.click(ctaButton());
        const rows = screen.getAllByTestId('picker-row');
        expect(rows).toHaveLength(2);
        expect(rows.map(r => r.textContent)).toEqual([
            expect.stringContaining('VL 1'),
            expect.stringContaining('VL 5'),
        ]);
    });

    it('🔴 réservation VALIDATED d\'un tiers dans 3 jours : véhicule PRÉSENT', async () => {
        const in3days = Date.now() + 3 * 24 * 3600_000;
        routeFetch({
            reservations: [reservation({
                vehicleId: 'uuid-1',
                startTime: new Date(in3days).toISOString(),
                endTime: new Date(in3days + 3600_000).toISOString(),
            })],
        });
        const user = userEvent.setup();
        renderSection({ vehicles: [makeVehicle({ id: 'uuid-1', name: 'VL 1' })] });

        await waitForCta('🚗 Emprunter (1 dispo)');
        await user.click(ctaButton());
        expect(screen.getAllByTestId('picker-row')[0].textContent).toContain('VL 1');
    });

    it('réservation PENDING d\'un tiers active maintenant : véhicule présent', async () => {
        routeFetch({ reservations: [reservation({ vehicleId: 'uuid-1', status: 'PENDING' })] });
        renderSection({ vehicles: [makeVehicle({ id: 'uuid-1' })] });

        await waitForCta('🚗 Emprunter (1 dispo)');
    });

    it('réservation VALIDATED active de soi-même : véhicule présent', async () => {
        routeFetch({ reservations: [reservation({ vehicleId: 'uuid-1', userEmail: ME })] });
        renderSection({ vehicles: [makeVehicle({ id: 'uuid-1' })] });

        await waitForCta('🚗 Emprunter (1 dispo)');
    });

    it('zéro éligible (tous IN_USE) : CTA désactivée, raison affichée, lien calendrier', async () => {
        routeFetch();
        renderSection({
            vehicles: [
                makeVehicle({ id: 'uuid-1', status: 'IN_USE' }),
                makeVehicle({ id: 'uuid-2', status: 'IN_USE' }),
            ],
        });

        await waitFor(() => expect(ctaButton().disabled).toBe(true));
        expect(screen.getByText("Aucun véhicule n'est disponible pour le moment.")).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Voir le calendrier' })).toBeTruthy();
    });
});

describe('QuickBorrowSection — hydratation et check-out', () => {
    it('parcours nominal en 2 clics : hydratation par NOM, no-store, CheckOutModal ouvert', async () => {
        routeFetch({ hydrate: { ...makeVehicle({ id: 'uuid-1', name: 'VL 186' }), trips: [] } });
        const user = userEvent.setup();
        renderSection({ vehicles: [makeVehicle({ id: 'uuid-1', name: 'VL 186' })] });

        await waitForCta('🚗 Emprunter (1 dispo)');

        await user.click(ctaButton());                                  // clic 1
        await user.click(screen.getAllByTestId('picker-row')[0]);       // clic 2

        await waitFor(() => expect(screen.getByTestId('checkout-modal')).toBeTruthy());
        expect(screen.queryByRole('dialog')).toBeNull();

        const hydrateCall = mockFetch.mock.calls.find(c => String(c[0]).startsWith('/api/vehicles/VL'));
        expect(hydrateCall).toBeTruthy();
        expect(String(hydrateCall![0])).toContain(encodeURIComponent('VL 186'));
        expect(String(hydrateCall![0])).not.toContain('uuid-1');
        expect(hydrateCall![1]).toMatchObject({ cache: 'no-store' });
    });

    it('hydratation renvoyant IN_USE : pas de CheckOutModal, message affiché, refresh déclenché', async () => {
        routeFetch({ hydrate: { ...makeVehicle({ id: 'uuid-1', name: 'VL 186' }), status: 'IN_USE', trips: [] } });
        const user = userEvent.setup();
        const { onCheckOutSuccess } = renderSection({ vehicles: [makeVehicle({ id: 'uuid-1', name: 'VL 186' })] });

        await waitForCta('🚗 Emprunter (1 dispo)');
        await user.click(ctaButton());
        await user.click(screen.getAllByTestId('picker-row')[0]);

        await waitFor(() => expect(screen.getByText("Ce véhicule vient d'être emprunté.")).toBeTruthy());
        expect(screen.queryByTestId('checkout-modal')).toBeNull();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(onCheckOutSuccess).toHaveBeenCalledTimes(1);
    });

    it('hydratation en échec réseau : alert, picker toujours ouvert et interactif', async () => {
        routeFetch({ hydrate: 'reject' });
        const user = userEvent.setup();
        renderSection({ vehicles: [makeVehicle({ id: 'uuid-1', name: 'VL 186' })] });

        await waitForCta('🚗 Emprunter (1 dispo)');
        await user.click(ctaButton());
        await user.click(screen.getAllByTestId('picker-row')[0]);

        await waitFor(() => expect(globalThis.alert).toHaveBeenCalledWith('Impossible de charger le véhicule…'));
        expect(screen.getByRole('dialog')).toBeTruthy();
        // pendingVehicleId remis à null → ligne redevenue cliquable, spinner disparu
        const row = screen.getAllByTestId('picker-row')[0] as HTMLButtonElement;
        expect(row.disabled).toBe(false);
        expect(screen.queryByLabelText('Chargement du véhicule')).toBeNull();
    });

    it('onSuccess de CheckOutModal : onCheckOutSuccess appelé une fois', async () => {
        routeFetch({ hydrate: { ...makeVehicle({ id: 'uuid-1', name: 'VL 186' }), trips: [] } });
        const user = userEvent.setup();
        const { onCheckOutSuccess } = renderSection({ vehicles: [makeVehicle({ id: 'uuid-1', name: 'VL 186' })] });

        await waitForCta('🚗 Emprunter (1 dispo)');
        await user.click(ctaButton());
        await user.click(screen.getAllByTestId('picker-row')[0]);
        await waitFor(() => expect(screen.getByTestId('checkout-modal')).toBeTruthy());

        fireEvent.click(screen.getByTestId('checkout-submit'));

        expect(onCheckOutSuccess).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('checkout-modal')).toBeNull();
    });
});

describe('QuickBorrowSection — permis et modes dégradés', () => {
    it('license-check bloqué pour un CHVL : état LICENSE_BLOCKED, CTA désactivée', async () => {
        routeFetch({ license: { blocked: true } });
        renderSection({ vehicles: [makeVehicle({ id: 'uuid-1' })] });

        await waitFor(() => expect(ctaButton().disabled).toBe(true));
        expect(screen.getByText(
            "Vos papiers n'ont pas été validés dans les délais — emprunt impossible. Présentez vos papiers à votre DLUS/DLAS.",
        )).toBeTruthy();
    });

    it('license-check rejeté : pas de crash, fail-open assumé (licenseBlocked reste false)', async () => {
        routeFetch({ license: 'reject' });
        renderSection({ vehicles: [makeVehicle({ id: 'uuid-1' })] });

        await waitForCta('🚗 Emprunter (1 dispo)');
        expect(ctaButton().disabled).toBe(false);
    });

    it('calendar rejeté : pas de crash, aucun véhicule exclu à tort (fail-open assumé)', async () => {
        routeFetch({ reservations: 'reject' });
        renderSection({
            vehicles: [makeVehicle({ id: 'uuid-1' }), makeVehicle({ id: 'uuid-2', name: 'VL 2' })],
        });

        await waitForCta('🚗 Emprunter (2 dispo)');
    });
});

describe('QuickBorrowSection — fraîcheur du cliché d\'autorisation', () => {
    it('🔴 retour de l\'onglet au premier plan : cliché refetché, réservation apparue entre-temps prise en compte', async () => {
        routeFetch({ reservations: [] });
        renderSection({ vehicles: [makeVehicle({ id: 'uuid-1', name: 'VL 1' })] });

        await waitForCta('🚗 Emprunter (1 dispo)');
        const callsBefore = mockFetch.mock.calls.length;

        // Un tiers fait valider une réservation pendant que l'onglet est en arrière-plan.
        routeFetch({ reservations: [reservation({ vehicleId: 'uuid-1' })] });
        fireEvent(document, new Event('visibilitychange'));

        await waitForCta('🚗 Emprunter (0 dispo)');
        expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore);
        expect(ctaButton().disabled).toBe(true);
    });

    it('🔴 re-gate pendant le refetch : la CTA repasse en chargement, désactivée', async () => {
        routeFetch();
        renderSection({ vehicles: [makeVehicle({ id: 'uuid-1' })] });

        await waitForCta('🚗 Emprunter (1 dispo)');

        routeFetch({ license: 'pending', reservations: 'pending' });
        fireEvent(document, new Event('visibilitychange'));

        await waitForCta('🚗 Emprunter…');
        expect(ctaButton().disabled).toBe(true);
    });

    it('onglet passé en arrière-plan : aucun refetch', async () => {
        routeFetch();
        renderSection({ vehicles: [makeVehicle({ id: 'uuid-1' })] });

        await waitForCta('🚗 Emprunter (1 dispo)');
        const callsBefore = mockFetch.mock.calls.length;

        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        try {
            fireEvent(document, new Event('visibilitychange'));
            expect(mockFetch.mock.calls.length).toBe(callsBefore);
        } finally {
            Reflect.deleteProperty(document, 'visibilityState');
        }
    });

    it('isDtView : aucun listener posé, visibilitychange n\'émet aucun fetch', () => {
        routeFetch();
        renderSection({ isDtView: true });

        fireEvent(document, new Event('visibilitychange'));

        expect(mockFetch).not.toHaveBeenCalled();
    });
});
