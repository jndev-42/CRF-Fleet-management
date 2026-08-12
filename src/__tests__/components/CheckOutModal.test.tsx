import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CheckOutModal from '@/components/vehicle/modals/CheckOutModal';
import type { Vehicle } from '@/app/vehicles/[id]/types';

vi.mock('@/lib/imageCompression', () => ({
    compressImage: vi.fn((f: File) => Promise.resolve(f)),
    compressImages: vi.fn((files: File[]) => Promise.resolve(files)),
    uploadFilesToDriveSafely: vi.fn().mockResolvedValue({ success: true, folderId: 'folder-1' }),
}));

const mockVehicle: Vehicle = {
    id: 'VL001',
    name: 'VL186',
    type: 'VL',
    plate: 'HJ-269-FE',
    status: 'AVAILABLE',
    parkingSpot: 'Place A-1',
    fuelLevel: 80,
    mileage: 12000,
    hasDSA: false,
    desinfTracking: false,
    notes: '',
    vin: null,
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
    return String(input);
}

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url.includes('/api/auth/session')) {
        return new Response(JSON.stringify({ user: { name: 'Jean Dupont', email: 'jean@test.com' } }), { status: 200 });
    }
    if (url.includes('/api/users')) {
        return new Response(JSON.stringify({ users: [] }), { status: 200 });
    }
    if (url.includes('/checklist')) {
        return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes('/reservations')) {
        return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes('/api/trips') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'trip-1' }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
}

function mockFetch(handler = defaultFetchHandler) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('CheckOutModal', () => {
    it('remplit le nom/email du conducteur depuis la session', async () => {
        mockFetch();
        render(<CheckOutModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByDisplayValue('Jean Dupont')).toBeTruthy();
        expect(screen.getByDisplayValue('jean@test.com')).toBeTruthy();
    });

    it('affiche le kilométrage et le niveau de carburant actuels', async () => {
        mockFetch();
        render(<CheckOutModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);

        await screen.findByDisplayValue('Jean Dupont');
        expect(screen.getByText('HJ-269-FE', { exact: false })).toBeTruthy();
        expect(screen.getByText(/12\s*000/)).toBeTruthy();
    });

    it('affiche les données Renault en cas de véhicule connecté', async () => {
        mockFetch(async (input) => {
            const url = getUrl(input);
            if (url.includes('/api/renault/')) {
                return new Response(JSON.stringify({ totalMileage: 15000, fuelQuantity: 30 }), { status: 200 });
            }
            return defaultFetchHandler(input);
        });

        const connectedVehicle = { ...mockVehicle, vin: 'VF1AB123456789012' };
        render(<CheckOutModal vehicle={connectedVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByText('📡 Connecté')).toBeTruthy();
    });

    it('soumet la prise du véhicule et appelle onSuccess (happy path)', async () => {
        const fetchMock = mockFetch();
        const onSuccess = vi.fn();
        const onRefetch = vi.fn();

        render(<CheckOutModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={onSuccess} onRefetch={onRefetch} />);

        await screen.findByDisplayValue('Jean Dupont');
        fireEvent.click(screen.getByRole('button', { name: /Prendre le véhicule/ }));

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalled();
            expect(onRefetch).toHaveBeenCalled();
        });

        const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]).includes('/api/trips') && (c[1] as RequestInit)?.method === 'POST');
        expect(postCall).toBeTruthy();
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.vehicleId).toBe('VL001');
        expect(body.missionType).toBe('DPS');
    });

    it('affiche une alerte et ne ferme pas la modale si l\'API échoue', async () => {
        const onSuccess = vi.fn();
        mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (url.includes('/api/trips') && init?.method === 'POST') {
                return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
            }
            return defaultFetchHandler(input, init);
        });

        render(<CheckOutModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={onSuccess} />);

        await screen.findByDisplayValue('Jean Dupont');
        fireEvent.click(screen.getByRole('button', { name: /Prendre le véhicule/ }));

        await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Erreur serveur'));
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('permet de saisir manuellement kilométrage/carburant corrigés', async () => {
        mockFetch();
        render(<CheckOutModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);

        await screen.findByDisplayValue('Jean Dupont');
        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        expect(screen.getByLabelText('Kilométrage réel (km)')).toBeTruthy();
    });

    it('ouvre la modale de signalement d\'incident', async () => {
        mockFetch();
        render(<CheckOutModal vehicle={mockVehicle} onClose={vi.fn()} onSuccess={vi.fn()} />);

        await screen.findByDisplayValue('Jean Dupont');
        fireEvent.click(screen.getByRole('button', { name: '🚨 Signaler incident' }));

        expect(screen.getByRole('dialog', { name: /Prendre VL186/ })).toBeTruthy();
    });

    it('appelle onClose au clic sur Annuler', async () => {
        mockFetch();
        const onClose = vi.fn();
        render(<CheckOutModal vehicle={mockVehicle} onClose={onClose} onSuccess={vi.fn()} />);

        await screen.findByDisplayValue('Jean Dupont');
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onClose).toHaveBeenCalled();
    });
});
