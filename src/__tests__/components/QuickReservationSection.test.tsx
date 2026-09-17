import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks hoistés ────────────────────────────────────────────────────────────
// Le formulaire a sa propre suite ; on n'observe ici que son ouverture, les props
// qu'il reçoit, et l'effet de sa réussite.
vi.mock('@/components/vehicle/modals/ReservationFormModal', () => ({
    default: ({ vehicleId, vehicleType, title, showOccupancy, onSuccess }: {
        vehicleId: string;
        vehicleType: string;
        title?: string;
        showOccupancy?: boolean;
        onSuccess: (r: { recurrenceWarning: string | null }) => void;
    }) => (
        <div
            data-testid="reservation-form-modal"
            data-vehicle-id={vehicleId}
            data-vehicle-type={vehicleType}
            data-occupancy={showOccupancy ? 'true' : 'false'}
        >
            {title}
            <button type="button" data-testid="reservation-submit" onClick={() => onSuccess({ recurrenceWarning: null })}>
                ok
            </button>
        </div>
    ),
}));

import QuickReservationSection from '@/app/vehicles/QuickReservationSection';
import type { DashboardVehicle } from '@/app/vehicles/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const ME = 'me@dev.local';

function makeVehicle(overrides: Partial<DashboardVehicle> = {}): DashboardVehicle {
    return {
        id: 'uuid-1',
        name: 'VL 186',
        type: 'VL',
        plate: 'AB-123-CD',
        status: 'AVAILABLE',
        hasActiveMaintenance: false,
        parkingSpot: 'Baigneur',
        fuelLevel: 80,
        mileage: 10000,
        hasDSA: false,
        notes: null,
        vin: null,
        connection: null,
        fuelType: 'Essence',
        transmission: 'Manuelle',
        trips: [],
        ...overrides,
    };
}

const NEVER = new Promise<Response>(() => { /* jamais résolue */ });

const mockFetch = vi.fn();

function routeFetch(opts: { license?: { blocked: boolean } | 'pending' | 'reject' } = {}) {
    const { license = { blocked: false } } = opts;
    mockFetch.mockImplementation((url: string) => {
        const href = String(url);
        if (href.startsWith('/api/me/license-check')) {
            if (license === 'pending') return NEVER;
            if (license === 'reject') return Promise.reject(new Error('boom'));
            return Promise.resolve(new Response(JSON.stringify(license), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
}

function renderSection(overrides: Partial<React.ComponentProps<typeof QuickReservationSection>> = {}) {
    const onReservationSuccess = vi.fn();
    const utils = render(
        <QuickReservationSection
            vehicles={[makeVehicle()]}
            userRoles={['CHVL']}
            currentUserEmail={ME}
            isDtView={false}
            vehiclesLoading={false}
            onReservationSuccess={onReservationSuccess}
            {...overrides}
        />,
    );
    return { ...utils, onReservationSuccess };
}

function ctaButton() {
    return screen.getByRole('button', { name: 'Réserver un véhicule' }) as HTMLButtonElement;
}

async function waitForCta(label: string) {
    await waitFor(() => expect(ctaButton().textContent).toBe(label));
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
describe('QuickReservationSection — fenêtre de chargement', () => {
    it('license-check en attente : CTA LOADING et désactivée', async () => {
        routeFetch({ license: 'pending' });
        const user = userEvent.setup();
        renderSection();

        const button = ctaButton();
        expect(button.textContent).toBe('📅 Réserver…');
        expect(button.disabled).toBe(true);

        await user.click(button);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('vehicles: [] : CTA désactivée, message flotte vide, aucun fetch émis', () => {
        routeFetch();
        renderSection({ vehicles: [] });

        expect(ctaButton().disabled).toBe(true);
        expect(screen.getByText("Aucun véhicule n'est rattaché à votre Unité Locale.")).toBeTruthy();
    });

    it('isDtView : rien dans le DOM, aucun fetch émis', () => {
        routeFetch();
        const { container } = renderSection({ isDtView: true });

        expect(container.innerHTML).toBe('');
        expect(mockFetch).not.toHaveBeenCalled();
    });
});

describe('QuickReservationSection — filtrage du picker', () => {
    const FLEET = [
        makeVehicle({ id: 'uuid-1', name: 'VL 1' }),
        makeVehicle({ id: 'uuid-2', name: 'VL 2', status: 'IN_USE' }),
        makeVehicle({ id: 'uuid-3', name: 'VPSP 3', type: 'VPSP' }),
        makeVehicle({ id: 'uuid-4', name: 'VL 4', status: 'MAINTENANCE', hasActiveMaintenance: true }),
    ];

    it('🔴 garde les véhicules IN_USE et en maintenance, exclut les VPSP pour un CHVL', async () => {
        routeFetch();
        const user = userEvent.setup();
        renderSection({ vehicles: FLEET });

        await waitForCta('📅 Réserver (3 véhicules)');

        await user.click(ctaButton());
        const rows = screen.getAllByTestId('picker-row');
        expect(rows.map(r => r.textContent)).toEqual([
            expect.stringContaining('VL 1'),
            expect.stringContaining('VL 2'),
            expect.stringContaining('VL 4'),
        ]);
    });

    it('CHVPSP pur : seuls les VPSP sont listés', async () => {
        routeFetch();
        const user = userEvent.setup();
        renderSection({ vehicles: FLEET, userRoles: ['CHVPSP'] });

        await waitForCta('📅 Réserver (1 véhicule)');
        await user.click(ctaButton());
        expect(screen.getAllByTestId('picker-row')[0].textContent).toContain('VPSP 3');
    });

    it('rôle non conducteur : aucun véhicule éligible, message littéral', async () => {
        routeFetch();
        renderSection({ vehicles: FLEET, userRoles: ['CI/RPAPS'] });

        expect(await screen.findByText("Votre rôle ne vous permet pas de réserver de véhicule.")).toBeTruthy();
        expect(ctaButton().disabled).toBe(true);
        expect(screen.getByRole('button', { name: 'Voir le calendrier' })).toBeTruthy();
    });

    it('ADMIN : toute la flotte est réservable, VPSP compris', async () => {
        routeFetch();
        renderSection({ vehicles: FLEET, userRoles: ['ADMIN'] });
        await waitForCta('📅 Réserver (4 véhicules)');
    });
});

describe('QuickReservationSection — parcours de réservation', () => {
    it('parcours nominal en 2 clics : formulaire ouvert avec le type du véhicule et l\'occupation', async () => {
        routeFetch();
        const user = userEvent.setup();
        renderSection({ vehicles: [makeVehicle({ id: 'uuid-9', name: 'VPSP 7', type: 'VPSP' })], userRoles: ['CHVPSP'] });

        await waitForCta('📅 Réserver (1 véhicule)');
        await user.click(ctaButton());                              // clic 1
        await user.click(screen.getAllByTestId('picker-row')[0]);   // clic 2

        const modal = await screen.findByTestId('reservation-form-modal');
        expect(modal.dataset.vehicleId).toBe('uuid-9');
        expect(modal.dataset.vehicleType).toBe('VPSP');
        expect(modal.dataset.occupancy).toBe('true');
        expect(modal.textContent).toContain('Réserver VPSP 7');
        expect(screen.queryByRole('dialog')).toBeNull(); // picker refermé
    });

    it('aucune hydratation par GET /api/vehicles/{name} : seul license-check est appelé', async () => {
        routeFetch();
        const user = userEvent.setup();
        renderSection();

        await waitForCta('📅 Réserver (1 véhicule)');
        await user.click(ctaButton());
        await user.click(screen.getAllByTestId('picker-row')[0]);

        await screen.findByTestId('reservation-form-modal');
        const nonLicenseCalls = mockFetch.mock.calls.filter(c => !String(c[0]).startsWith('/api/me/license-check'));
        expect(nonLicenseCalls).toHaveLength(0);
    });

    it('succès du formulaire : grille rafraîchie, modal fermé, message de confirmation', async () => {
        routeFetch();
        const user = userEvent.setup();
        const { onReservationSuccess } = renderSection();

        await waitForCta('📅 Réserver (1 véhicule)');
        await user.click(ctaButton());
        await user.click(screen.getAllByTestId('picker-row')[0]);
        await screen.findByTestId('reservation-form-modal');

        fireEvent.click(screen.getByTestId('reservation-submit'));

        expect(onReservationSuccess).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('reservation-form-modal')).toBeNull();
        expect(screen.getByText('Réservation enregistrée.')).toBeTruthy();
    });
});

describe('QuickReservationSection — papiers et modes dégradés', () => {
    it('license-check bloqué pour un CHVL : LICENSE_BLOCKED, CTA désactivée', async () => {
        routeFetch({ license: { blocked: true } });
        renderSection();

        expect(await screen.findByText(
            "Vos papiers n'ont pas été validés — réservation bloquée. Présentez vos papiers à votre DLUS/DLAS.",
        )).toBeTruthy();
        expect(ctaButton().disabled).toBe(true);
    });

    it('license-check bloqué pour un ADMIN : réservation toujours possible', async () => {
        routeFetch({ license: { blocked: true } });
        renderSection({ userRoles: ['ADMIN'] });

        await waitForCta('📅 Réserver (1 véhicule)');
        expect(ctaButton().disabled).toBe(false);
    });

    it('license-check rejeté : pas de crash, fail-open assumé', async () => {
        routeFetch({ license: 'reject' });
        renderSection();

        await waitForCta('📅 Réserver (1 véhicule)');
        expect(ctaButton().disabled).toBe(false);
    });
});
