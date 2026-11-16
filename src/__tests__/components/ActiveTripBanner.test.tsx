import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ActiveTripBanner from '@/app/vehicles/[id]/ActiveTripBanner';
import type { Trip } from '@/app/vehicles/[id]/types';

const trip = {
    id: 'trip-1', driverName: 'Jean', driverEmail: 'jean@test.com', secondDriverName: null,
    checkOutAt: '2026-01-01T10:00:00Z', missionType: 'Mission', missionName: null, desinfResponsable: null,
} as unknown as Trip;
const users = [
    { id: 'u1', name: 'Alice Martin', email: 'alice@test.com' },
    { id: 'u2', name: 'Bruno Petit', email: 'bruno@test.com' },
];

afterEach(() => vi.restoreAllMocks());

describe('ActiveTripBanner — ajout du 2ème conducteur', () => {
    it('désactive « Valider » sans choix, puis envoie le conducteur choisi', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
        const onSecondDriverAdded = vi.fn();
        render(
            <ActiveTripBanner
                activeTrip={trip}
                userRoles={['CHVL']}
                currentUserEmail="jean@test.com"
                users={users}
                canCheckIn
                onShowDesinfPre={vi.fn()}
                onEditCheckOut={vi.fn()}
                onCheckIn={vi.fn()}
                onSecondDriverAdded={onSecondDriverAdded}
                showToast={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /Ajouter 2nd cond\./ }));
        const submit = screen.getByRole('button', { name: 'Valider' }) as HTMLButtonElement;
        expect(submit.disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: /Sélectionner un utilisateur/ }));
        fireEvent.click(screen.getByRole('option', { name: 'Bruno Petit' }));
        expect((screen.getByRole('button', { name: 'Valider' }) as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Valider' }));

        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
        const [url, init] = fetchSpy.mock.calls[0];
        expect(String(url)).toBe('/api/trips/trip-1/second-driver');
        expect(JSON.parse((init as RequestInit).body as string)).toEqual({ secondDriverId: 'u2' });
        await waitFor(() => expect(onSecondDriverAdded).toHaveBeenCalled());
    });
});
