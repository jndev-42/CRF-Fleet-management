import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ReservationBlock from '@/components/vehicle/ReservationBlock';

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

function mockFetch(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response> | Response) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

const now = new Date();
const future1 = new Date(now.getTime() + 2 * 3600_000);
const future2 = new Date(now.getTime() + 4 * 3600_000);

const baseReservation = {
    id: 'res-1',
    vehicleId: 'VL001',
    userEmail: 'other@test.com',
    userName: 'Autre Chauffeur',
    startTime: future1.toISOString(),
    endTime: future2.toISOString(),
    reason: 'Maraude',
    status: 'PENDING' as const,
    createdAt: now.toISOString(),
};

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ReservationBlock', () => {
    it('affiche le chargement puis l\'état vide sans réservation', async () => {
        mockFetch(async () => new Response(JSON.stringify([]), { status: 200 }));

        render(
            <ReservationBlock
                vehicleId="VL001"
                vehicleType="VL"
                currentUserEmail="me@test.com"
                userRoles={['CHVL']}
            />
        );

        expect(screen.getByText('Chargement des réservations...')).toBeTruthy();
        expect(await screen.findByText('Aucune réservation prévue pour le moment.')).toBeTruthy();
    });

    it('affiche la liste des réservations à venir avec leur statut', async () => {
        mockFetch(async () => new Response(JSON.stringify([baseReservation]), { status: 200 }));

        render(
            <ReservationBlock
                vehicleId="VL001"
                vehicleType="VL"
                currentUserEmail="me@test.com"
                userRoles={['CHVL']}
            />
        );

        expect(await screen.findByText('Autre Chauffeur')).toBeTruthy();
        expect(screen.getByText('En attente')).toBeTruthy();
    });

    it('notifie le parent quand une réservation validée par un autre utilisateur est active', async () => {
        const activeRes = { ...baseReservation, status: 'VALIDATED' as const, startTime: new Date(now.getTime() - 3600_000).toISOString(), endTime: new Date(now.getTime() + 3600_000).toISOString() };
        mockFetch(async () => new Response(JSON.stringify([activeRes]), { status: 200 }));
        const onChange = vi.fn();

        render(
            <ReservationBlock
                vehicleId="VL001"
                vehicleType="VL"
                currentUserEmail="me@test.com"
                userRoles={['CHVL']}
                onActiveReservationChange={onChange}
            />
        );

        await waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
    });

    it('ouvre la modale de création via le bouton "+ Réserver"', async () => {
        mockFetch(async () => new Response(JSON.stringify([]), { status: 200 }));

        render(
            <ReservationBlock
                vehicleId="VL001"
                vehicleType="VL"
                currentUserEmail="me@test.com"
                userRoles={['CHVL']}
            />
        );

        await screen.findByText('Aucune réservation prévue pour le moment.');
        fireEvent.click(screen.getByRole('button', { name: '+ Réserver' }));

        expect(screen.getByText('Réserver ce véhicule')).toBeTruthy();
        expect(screen.getByText('Votre demande sera soumise à validation par un responsable.')).toBeTruthy();
    });

    it('désactive le bouton "+ Réserver" si le permis est bloqué et l\'utilisateur non-gestionnaire', async () => {
        mockFetch(async () => new Response(JSON.stringify([]), { status: 200 }));

        render(
            <ReservationBlock
                vehicleId="VL001"
                vehicleType="VL"
                currentUserEmail="me@test.com"
                userRoles={['CHVL']}
                licenseBlocked
            />
        );

        await screen.findByText('Aucune réservation prévue pour le moment.');
        expect((screen.getByRole('button', { name: '+ Réserver' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('soumet une nouvelle réservation non récurrente (happy path)', async () => {
        const fetchMock = mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (url.includes('/reservations') && (!init || init.method === 'GET')) {
                return new Response(JSON.stringify([]), { status: 200 });
            }
            if (url.includes('/reservations') && init?.method === 'POST') {
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }
            return new Response(JSON.stringify({}), { status: 200 });
        });

        render(
            <ReservationBlock
                vehicleId="VL001"
                vehicleType="VL"
                currentUserEmail="me@test.com"
                userRoles={['CHVL']}
            />
        );

        await screen.findByText('Aucune réservation prévue pour le moment.');
        fireEvent.click(screen.getByRole('button', { name: '+ Réserver' }));

        const modal = screen.getByText('Réserver ce véhicule').closest('.modal-content') as HTMLElement;
        const dateInputs = within(modal).getAllByDisplayValue('') as HTMLInputElement[];
        // form-input order: startDate, startTime, endDate, endTime, reason
        const inputs = modal.querySelectorAll('input.form-input');
        fireEvent.change(inputs[0], { target: { value: '2026-09-01' } });
        fireEvent.change(inputs[1], { target: { value: '10:00' } });
        fireEvent.change(inputs[2], { target: { value: '2026-09-01' } });
        fireEvent.change(inputs[3], { target: { value: '12:00' } });
        void dateInputs;

        fireEvent.click(within(modal).getByRole('button', { name: /Soumettre la demande/ }));

        await waitFor(() => {
            const postCall = fetchMock.mock.calls.find(c => c[1]?.method === 'POST');
            expect(postCall).toBeTruthy();
        });
    });

    it('supprime une réservation après confirmation', async () => {
        const fetchMock = mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (init?.method === 'DELETE') return new Response(JSON.stringify({ success: true }), { status: 200 });
            if (url.includes('/reservations')) return new Response(JSON.stringify([baseReservation]), { status: 200 });
            return new Response(JSON.stringify({}), { status: 200 });
        });

        render(
            <ReservationBlock
                vehicleId="VL001"
                vehicleType="VL"
                currentUserEmail="other@test.com"
                userRoles={['CHVL']}
            />
        );

        await screen.findByText('Autre Chauffeur');
        fireEvent.click(screen.getByRole('button', { name: 'Annuler cette occurrence' }));

        expect(window.confirm).toHaveBeenCalled();
        await waitFor(() => {
            const deleteCall = fetchMock.mock.calls.find(c => c[1]?.method === 'DELETE');
            expect(deleteCall).toBeTruthy();
        });
    });

    it('affiche le bouton Valider pour un ADMIN sur une réservation en attente', async () => {
        mockFetch(async () => new Response(JSON.stringify([baseReservation]), { status: 200 }));

        render(
            <ReservationBlock
                vehicleId="VL001"
                vehicleType="VL"
                currentUserEmail="admin@test.com"
                userRoles={['ADMIN']}
            />
        );

        await screen.findByText('Autre Chauffeur');
        expect(screen.getByRole('button', { name: 'Valider cette occurrence' })).toBeTruthy();
    });

    it('masque toutes les actions en readOnly', async () => {
        mockFetch(async () => new Response(JSON.stringify([baseReservation]), { status: 200 }));

        render(
            <ReservationBlock
                vehicleId="VL001"
                vehicleType="VL"
                currentUserEmail="other@test.com"
                userRoles={['ADMIN']}
                readOnly
            />
        );

        await screen.findByText('Autre Chauffeur');
        expect(screen.queryByRole('button', { name: '+ Réserver' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Modifier cette occurrence' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Annuler cette occurrence' })).toBeNull();
    });

    it('affiche les actions de groupe pour une réservation récurrente', async () => {
        const recurring = { ...baseReservation, recurrenceGroupId: 'group-1' };
        mockFetch(async () => new Response(JSON.stringify([recurring]), { status: 200 }));

        render(
            <ReservationBlock
                vehicleId="VL001"
                vehicleType="VL"
                currentUserEmail="admin@test.com"
                userRoles={['ADMIN']}
            />
        );

        await screen.findByText('Autre Chauffeur');
        expect(screen.getByText('🔁 Récurrente')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Annuler toutes les occurrences futures/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Valider toutes les occurrences futures/ })).toBeTruthy();
    });
});
