import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CheckOutForm from '@/app/qr/[token]/CheckOutForm';
import type { QRVehicle } from '@/app/qr/[token]/types';

const vehicle: QRVehicle = {
    id: 'VL001', name: 'VL 186', plate: 'AA-123-AA', type: 'VL', status: 'AVAILABLE',
    fuelLevel: 60, mileage: 10000, fuelType: null, hasDSA: false, desinfTracking: false,
    parkingSpot: null, connection: null, maxFuelCapacity: null, activeTrip: null,
};

afterEach(() => vi.unstubAllGlobals());

describe('CheckOutForm — checklist QR', () => {
    it('lit la checklist par la route QR (ouverte entre ULs)', async () => {
        const fetchMock = vi.fn().mockImplementation(async () => new Response('[]', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        render(<CheckOutForm vehicle={vehicle} token="tok" onSuccess={() => {}} />);

        await waitFor(() => {
            const urls = fetchMock.mock.calls.map(([u]) => String(u));
            expect(urls).toContain('/api/qr/tok/checklist?type=checkout');
            expect(urls.some(u => u.startsWith('/api/vehicles/'))).toBe(false);
        });
    });
});
