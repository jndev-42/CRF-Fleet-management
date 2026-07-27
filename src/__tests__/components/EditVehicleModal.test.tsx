import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EditVehicleModal from '@/components/vehicle/modals/EditVehicleModal';
import type { Vehicle } from '@/app/vehicles/[id]/types';

const mockVehicle: Vehicle = {
    id: 'veh-1',
    name: 'VL186',
    type: 'VL',
    plate: 'HJ-269-FE',
    status: 'AVAILABLE',
    parkingSpot: 'Place A-1',
    fuelLevel: 80,
    mileage: 12000,
    hasDSA: true,
    desinfTracking: true,
    notes: 'Note initiale',
    vin: 'VF11234567890',
    fuelType: 'Essence',
    maxFuelCapacity: 50,
    maxBatteryCapacityKwh: null,
    lastDesinfDate: null,
    nextDesinfMaxDate: null,
    firstRegistrationDate: '2022-01-15',
    revisionKmInterval: 15000,
    revisionYearInterval: 1,
    trips: [],
};

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    if ('href' in input && typeof input.href === 'string') return input.href;
    return String(input);
}

function mockFetch(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock);
    if (typeof window !== 'undefined') {
        vi.spyOn(window, 'fetch').mockImplementation(mock);
    }
    return mock;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('EditVehicleModal Component', () => {
    it('does not render when isOpen is false', () => {
        const { container } = render(
            <EditVehicleModal
                isOpen={false}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                vehicle={mockVehicle}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders form pre-populated with vehicle values when open', async () => {
        mockFetch(async (input: string | URL | Request) => {
            const urlStr = getUrl(input);
            if (urlStr.includes('/api/ul')) {
                return {
                    ok: true,
                    json: async () => ({ uls: [{ id: 'ul-paris-18', defaultParkingSpots: ['Place A-1'] }] }),
                } as Response;
            }
            return { ok: true, json: async () => ({}) } as Response;
        });

        render(
            <EditVehicleModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                vehicle={mockVehicle}
            />
        );

        expect(await screen.findByText('✏️ Éditer le véhicule')).toBeTruthy();

        expect(screen.getByDisplayValue('VL186')).toBeTruthy();
        expect(screen.getByDisplayValue('HJ-269-FE')).toBeTruthy();
        expect(screen.getByDisplayValue('VF11234567890')).toBeTruthy();
    });

    it('submits updated values and calls onSuccess', async () => {
        const handleSuccess = vi.fn();
        const handleClose = vi.fn();

        mockFetch(async (input: string | URL | Request, init?: RequestInit) => {
            const urlStr = getUrl(input);
            const method = init?.method || (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET');
            if (urlStr.includes('/api/ul')) {
                return {
                    ok: true,
                    json: async () => ({ uls: [{ id: 'ul-paris-18', defaultParkingSpots: ['Place A-1'] }] }),
                } as Response;
            }
            if (urlStr.includes('/api/vehicles/') && String(method).toUpperCase() === 'PATCH') {
                return {
                    ok: true,
                    json: async () => ({ name: 'VL186-MOD', plate: 'AB-999-CD' }),
                } as Response;
            }
            return { ok: true, json: async () => ({}) } as Response;
        });

        render(
            <EditVehicleModal
                isOpen={true}
                onClose={handleClose}
                onSuccess={handleSuccess}
                vehicle={mockVehicle}
            />
        );

        const nameInput = await screen.findByDisplayValue('VL186');
        fireEvent.change(nameInput, { target: { value: 'VL186-MOD' } });
        expect(await screen.findByDisplayValue('VL186-MOD')).toBeTruthy();

        const submitBtn = screen.getByRole('button', { name: 'Enregistrer les modifications' });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(handleSuccess).toHaveBeenCalledWith(expect.objectContaining({
                name: 'VL186-MOD',
            }));
            expect(handleClose).toHaveBeenCalled();
        });
    });

    it('displays error message when API returns error', async () => {
        mockFetch(async (input: string | URL | Request, init?: RequestInit) => {
            const urlStr = getUrl(input);
            const method = init?.method || (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET');
            if (urlStr.includes('/api/ul')) {
                return {
                    ok: true,
                    json: async () => ({ uls: [{ id: 'ul-paris-18', defaultParkingSpots: ['Place A-1'] }] }),
                } as Response;
            }
            if (urlStr.includes('/api/vehicles/') && String(method).toUpperCase() === 'PATCH') {
                return {
                    ok: false,
                    status: 400,
                    json: async () => ({ error: 'Un véhicule avec ce nom existe déjà.' }),
                } as Response;
            }
            return { ok: true, json: async () => ({}) } as Response;
        });

        render(
            <EditVehicleModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                vehicle={mockVehicle}
            />
        );

        const nameInput = await screen.findByDisplayValue('VL186');
        fireEvent.change(nameInput, { target: { value: 'VL186-MOD' } });
        expect(await screen.findByDisplayValue('VL186-MOD')).toBeTruthy();

        const submitBtn = screen.getByRole('button', { name: 'Enregistrer les modifications' });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(screen.getByText('Un véhicule avec ce nom existe déjà.')).toBeTruthy();
        });
    });
});
