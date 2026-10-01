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
    connection: null,
    ulId: 'ul-paris-18',
    fuelType: 'Essence',
    transmission: 'Manuelle',
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
        // Le VIN n'est plus éditable ici : il est propriété exclusive du flux de connexion du véhicule.
        expect(screen.queryByDisplayValue('VF11234567890')).toBeNull();
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

    it('envoie la boîte de vitesses sélectionnée dans le payload PATCH', async () => {
        let patchBody: Record<string, unknown> = {};

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
                patchBody = JSON.parse(String(init?.body ?? '{}'));
                return { ok: true, json: async () => ({ name: 'VL186' }) } as Response;
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

        const select = await screen.findByDisplayValue('Manuelle');
        fireEvent.change(select, { target: { value: 'Automatique' } });
        expect(await screen.findByDisplayValue('Automatique')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

        await waitFor(() => {
            expect(patchBody.transmission).toBe('Automatique');
        });
    });

    it('retire le guide après la modification, sous le nouveau nom du véhicule', async () => {
        const calls: Array<{ url: string; method: string }> = [];
        mockFetch(async (input: string | URL | Request, init?: RequestInit) => {
            const urlStr = getUrl(input);
            const method = String(init?.method || 'GET').toUpperCase();
            calls.push({ url: urlStr, method });
            if (urlStr.includes('/api/ul')) {
                return new Response(JSON.stringify({ uls: [] }), { status: 200 });
            }
            return new Response(JSON.stringify({}), { status: 200 });
        });
        const handleSuccess = vi.fn();

        render(
            <EditVehicleModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={handleSuccess}
                vehicle={{ ...mockVehicle, guideFileName: 'VPSP 182.pdf' }}
            />
        );

        const nameInput = await screen.findByDisplayValue('VL186');
        fireEvent.change(nameInput, { target: { value: 'VL186-MOD' } });
        expect(screen.getByTestId('guide-status').textContent).toContain('VPSP 182.pdf');
        fireEvent.click(screen.getByRole('button', { name: /Retirer/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

        await waitFor(() => expect(handleSuccess).toHaveBeenCalled());
        const writes = calls.filter(c => c.method !== 'GET');
        expect(writes).toEqual([
            { url: '/api/vehicles/VL186', method: 'PATCH' },
            { url: '/api/vehicles/VL186-MOD/guide', method: 'DELETE' },
        ]);
    });

    it("signale l'échec du guide sans annuler la modification", async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        mockFetch(async (input: string | URL | Request) => {
            const urlStr = getUrl(input);
            if (urlStr.endsWith('/guide')) {
                return new Response(JSON.stringify({ error: 'Le fichier est trop volumineux (4 Mo maximum).' }), { status: 413 });
            }
            if (urlStr.includes('/api/ul')) {
                return new Response(JSON.stringify({ uls: [] }), { status: 200 });
            }
            return new Response(JSON.stringify({}), { status: 200 });
        });
        const handleSuccess = vi.fn();

        render(<EditVehicleModal isOpen={true} onClose={vi.fn()} onSuccess={handleSuccess} vehicle={mockVehicle} />);

        await screen.findByDisplayValue('VL186');
        fireEvent.change(screen.getByLabelText('Guide de vérification (PDF, 4 Mo max) — Optionnel'), {
            target: { files: [new File(['%PDF-1.7'], 'guide.pdf', { type: 'application/pdf' })] },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

        await waitFor(() => expect(handleSuccess).toHaveBeenCalled());
        expect(alertSpy).toHaveBeenCalledWith('Véhicule modifié, guide non enregistré : Le fichier est trop volumineux (4 Mo maximum).');
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
