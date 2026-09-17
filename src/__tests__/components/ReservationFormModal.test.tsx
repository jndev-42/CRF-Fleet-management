import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ReservationFormModal from '@/components/vehicle/modals/ReservationFormModal';

// Le mini-calendrier a sa propre suite (`ReservationSlotPicker.test.tsx`) et son propre
// fetch : on le stubbe ici pour isoler le formulaire, tout en gardant sa capacité à
// remonter une plage sélectionnée.
vi.mock('@/components/vehicle/ReservationSlotPicker', () => ({
    default: ({ onSelectRange }: { onSelectRange: (s: string, e: string) => void }) => (
        <div data-testid="slot-picker">
            <button type="button" data-testid="slot-pick" onClick={() => onSelectRange('2026-11-02', '2026-11-04')}>
                choisir
            </button>
        </div>
    ),
}));

const mockFetch = vi.fn();

function routeFetch(opts: {
    post?: { ok?: boolean; status?: number; body?: Record<string, unknown> };
    users?: { id: string; name: string | null; email: string }[];
} = {}) {
    const { post = { ok: true, body: { success: true } }, users = [] } = opts;

    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        const href = String(url);
        if (href.startsWith('/api/users')) {
            return Promise.resolve(new Response(JSON.stringify({ users }), { status: 200 }));
        }
        if (href.includes('/reservations') && init?.method === 'POST') {
            return Promise.resolve(new Response(
                JSON.stringify(post.body ?? {}),
                { status: post.status ?? (post.ok === false ? 409 : 201) },
            ));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
}

function renderModal(overrides: Partial<React.ComponentProps<typeof ReservationFormModal>> = {}) {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const utils = render(
        <ReservationFormModal
            vehicleId="veh-1"
            vehicleType="VL"
            currentUserEmail="me@dev.local"
            userRoles={['CHVL']}
            onClose={onClose}
            onSuccess={onSuccess}
            {...overrides}
        />,
    );
    return { ...utils, onClose, onSuccess };
}

/** Champs dates/heures/motif, dans l'ordre du formulaire. */
function formInputs(): HTMLInputElement[] {
    const modal = document.querySelector('.modal-content') as HTMLElement;
    return Array.from(modal.querySelectorAll('input.form-input')) as HTMLInputElement[];
}

function fillSimpleSlot() {
    const inputs = formInputs();
    fireEvent.change(inputs[0], { target: { value: '2026-11-02' } });
    fireEvent.change(inputs[1], { target: { value: '10:00' } });
    fireEvent.change(inputs[2], { target: { value: '2026-11-02' } });
    fireEvent.change(inputs[3], { target: { value: '12:00' } });
}

function postCall() {
    return mockFetch.mock.calls.find(c => c[1]?.method === 'POST');
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

describe('ReservationFormModal — rendu', () => {
    it('non-validateur : bandeau « soumise à validation », bouton « Soumettre la demande »', () => {
        routeFetch();
        renderModal({ userRoles: ['CHVL'] });

        expect(screen.getByText('Réserver ce véhicule')).toBeTruthy();
        expect(screen.getByText('Votre demande sera soumise à validation par un responsable.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Soumettre la demande' })).toBeTruthy();
    });

    it('validateur ADMIN : aucun bandeau, bouton « Valider »', () => {
        routeFetch();
        renderModal({ userRoles: ['ADMIN'] });

        expect(screen.queryByText('Votre demande sera soumise à validation par un responsable.')).toBeNull();
        expect(screen.getByRole('button', { name: 'Valider' })).toBeTruthy();
    });

    it('titre personnalisable (parcours rapide)', () => {
        routeFetch();
        renderModal({ title: 'Réserver VL 186' });
        expect(screen.getByText('Réserver VL 186')).toBeTruthy();
    });

    it('CHVL : aucun sélecteur de chauffeur, aucun appel à /api/users', () => {
        routeFetch();
        renderModal({ userRoles: ['CHVL'] });

        expect(screen.queryByText('Chauffeur (Pour)')).toBeNull();
        expect(mockFetch.mock.calls.filter(c => String(c[0]).startsWith('/api/users'))).toHaveLength(0);
    });

    it('🔴 RESPO : le fetch de la liste des chauffeurs est émis PAR LE MODAL, avec son vehicleType', async () => {
        routeFetch({ users: [{ id: 'u-1', name: 'Alice', email: 'alice@dev.local' }] });
        renderModal({ userRoles: ['RESPO'], vehicleType: 'VPSP 12' });

        expect(screen.getByText('Chauffeur (Pour)')).toBeTruthy();
        await waitFor(() => {
            const call = mockFetch.mock.calls.find(c => String(c[0]).startsWith('/api/users'));
            expect(call).toBeTruthy();
            expect(String(call![0])).toBe(`/api/users?vehicleType=${encodeURIComponent('VPSP 12')}`);
        });
    });

    it('showOccupancy : mini-calendrier rendu ; absent par défaut (fiche véhicule)', () => {
        routeFetch();
        const { unmount } = renderModal();
        expect(screen.queryByTestId('slot-picker')).toBeNull();
        unmount();

        renderModal({ showOccupancy: true });
        expect(screen.getByTestId('slot-picker')).toBeTruthy();
    });

    it('sélection sur le mini-calendrier : les champs de dates sont préremplis', () => {
        routeFetch();
        renderModal({ showOccupancy: true });

        fireEvent.click(screen.getByTestId('slot-pick'));

        const inputs = formInputs();
        expect(inputs[0].value).toBe('2026-11-02'); // date de début
        expect(inputs[2].value).toBe('2026-11-04'); // date de fin
    });
});

describe('ReservationFormModal — soumission simple', () => {
    it('happy path : POST sur la route existante, aucune autre surface API', async () => {
        routeFetch();
        const { onSuccess } = renderModal();

        fillSimpleSlot();
        fireEvent.change(formInputs()[4], { target: { value: 'Maraude' } });
        fireEvent.click(screen.getByRole('button', { name: 'Soumettre la demande' }));

        await waitFor(() => expect(postCall()).toBeTruthy());
        expect(String(postCall()![0])).toBe('/api/vehicles/veh-1/reservations');

        const body = JSON.parse(String(postCall()![1]!.body));
        expect(body.reason).toBe('Maraude');
        expect(new Date(body.startTime).toISOString()).toBe(new Date('2026-11-02T10:00').toISOString());
        expect(new Date(body.endTime).toISOString()).toBe(new Date('2026-11-02T12:00').toISOString());
        expect(body.onBehalfOfUserId).toBeUndefined();
        expect(body.isUnassignedDriver).toBeUndefined();

        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ recurrenceWarning: null }));
    });

    it('409 du serveur : alert affichée, onSuccess NON appelé, modal maintenu', async () => {
        routeFetch({ post: { ok: false, status: 409, body: { error: 'Ce créneau chevauche une réservation déjà validée.' } } });
        const { onSuccess, onClose } = renderModal();

        fillSimpleSlot();
        fireEvent.click(screen.getByRole('button', { name: 'Soumettre la demande' }));

        await waitFor(() => expect(globalThis.alert).toHaveBeenCalledWith('Ce créneau chevauche une réservation déjà validée.'));
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('RESPO + « Chauffeur non décidé » : isUnassignedDriver transmis', async () => {
        routeFetch();
        renderModal({ userRoles: ['RESPO'] });

        fireEvent.click(screen.getByRole('button', { name: 'Chauffeur non décidé' }));
        expect(screen.getByText('Cette réservation sera enregistrée sans chauffeur attribué.')).toBeTruthy();

        fillSimpleSlot();
        fireEvent.click(screen.getByRole('button', { name: 'Valider' }));

        await waitFor(() => expect(postCall()).toBeTruthy());
        expect(JSON.parse(String(postCall()![1]!.body)).isUnassignedDriver).toBe(true);
    });

    it('bouton Annuler : onClose appelé, aucun POST', () => {
        routeFetch();
        const { onClose } = renderModal();

        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(postCall()).toBeUndefined();
    });
});

describe('ReservationFormModal — récurrence', () => {
    function enableRecurrence() {
        fireEvent.click(screen.getByRole('switch', { name: /Réservation récurrente/ }));
    }

    it('toggle : le panneau de récurrence remplace les champs de dates simples', () => {
        routeFetch();
        renderModal();

        enableRecurrence();

        expect(screen.getByText('Paramètres de récurrence')).toBeTruthy();
        expect(screen.queryByText('Date de début')).toBeNull();
        expect(screen.getByRole('button', { name: /Soumettre la récurrence/ })).toBeTruthy();
    });

    it('soumission récurrente : payload `recurrence` complet', async () => {
        routeFetch({ post: { body: { success: true, created: 4, skipped: [] } } });
        const { onSuccess } = renderModal();

        enableRecurrence();
        fireEvent.click(screen.getByRole('button', { name: 'Lundi' }));

        const modal = document.querySelector('.modal-content') as HTMLElement;
        const inputs = Array.from(modal.querySelectorAll('input.form-input')) as HTMLInputElement[];
        // Panneau récurrence : startHour, endHour, firstOccurrenceDate, recurrenceEndDate, puis motif
        fireEvent.change(inputs[0], { target: { value: '09:00' } });
        fireEvent.change(inputs[1], { target: { value: '11:00' } });
        fireEvent.change(inputs[2], { target: { value: '2026-11-02' } });
        fireEvent.change(inputs[3], { target: { value: '2026-11-30' } });

        fireEvent.click(within(modal).getByRole('button', { name: /Soumettre la récurrence/ }));

        await waitFor(() => expect(postCall()).toBeTruthy());
        expect(JSON.parse(String(postCall()![1]!.body)).recurrence).toMatchObject({
            daysOfWeek: [1],
            startHour: '09:00',
            endHour: '11:00',
            firstOccurrenceDate: '2026-11-02',
            recurrenceEndDate: '2026-11-30',
        });
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ recurrenceWarning: null }));
    });

    it('créneaux ignorés : le bandeau d\'alerte est remonté à l\'appelant', async () => {
        routeFetch({ post: { body: { success: true, created: 2, skipped: ['2026-11-09'] } } });
        const { onSuccess } = renderModal();

        enableRecurrence();
        fireEvent.click(screen.getByRole('button', { name: 'Lundi' }));

        const modal = document.querySelector('.modal-content') as HTMLElement;
        const inputs = Array.from(modal.querySelectorAll('input.form-input')) as HTMLInputElement[];
        fireEvent.change(inputs[0], { target: { value: '09:00' } });
        fireEvent.change(inputs[1], { target: { value: '11:00' } });
        fireEvent.change(inputs[2], { target: { value: '2026-11-02' } });
        fireEvent.change(inputs[3], { target: { value: '2026-11-30' } });

        fireEvent.click(within(modal).getByRole('button', { name: /Soumettre la récurrence/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const warning = onSuccess.mock.calls[0][0].recurrenceWarning as string;
        expect(warning).toContain('2 créneau(x) créé(s)');
        expect(warning).toContain('1 créneau(x) ignoré(s)');
        expect(warning).toContain('09/11');
    });
});
