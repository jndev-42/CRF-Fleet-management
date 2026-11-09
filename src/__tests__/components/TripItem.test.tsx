import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TripItem from '@/components/vehicle/TripItem';
import type { Trip, Vehicle } from '@/app/vehicles/[id]/types';

const vehicle = { id: 'VL001', name: 'VL186', type: 'VL' } as unknown as Vehicle;

function trip(driveFolderId: string | null): Trip {
    return {
        id: 'trip-1', driverId: 'u1', secondDriverId: null, driverName: 'Alice', driverEmail: null,
        secondDriverName: null, secondDriverEmail: null, missionType: 'Logistique', missionName: null,
        checkOutAt: '2026-11-08T10:00:00Z', checkInAt: '2026-11-08T12:00:00Z', mileageOut: 1000, mileageIn: 1010,
        fuelOut: 50, fuelIn: 45, parkingOut: null, parkingIn: null, conditionOut: 'BON', conditionIn: 'BON',
        cleanlinessOut: null, cleanlinessIn: null, dsaChecked: false, commentsOut: null, commentsIn: null,
        incident: null, parkingPhoto: null, driveFolderId,
    } as unknown as Trip;
}

function renderItem(driveFolderId: string | null) {
    const onViewPhotos = vi.fn();
    render(<TripItem trip={trip(driveFolderId)} vehicle={vehicle} userRoles={['CHVL']} onDelete={vi.fn()} onViewPhotos={onViewPhotos} />);
    return onViewPhotos;
}

describe('TripItem — bouton « Voir les photos »', () => {
    it('préfixe R2 : bouton affiché, onViewPhotos reçoit le préfixe', () => {
        const ref = 'trip-photos/paris-18/vl186-20261108-100000-a1b2';
        const onViewPhotos = renderItem(ref);
        fireEvent.click(screen.getByRole('button', { name: /Voir les photos/ }));
        expect(onViewPhotos).toHaveBeenCalledWith(ref);
    });

    it.each([['1AbCdrive'], [null]])('référence %j : aucun bouton', (ref) => {
        renderItem(ref);
        expect(screen.queryByRole('button', { name: /Voir les photos/ })).toBeNull();
    });
});
