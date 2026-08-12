import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CheckInModal from '@/components/vehicle/modals/CheckInModal';
import type { Vehicle, Trip } from '@/app/vehicles/[id]/types';

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
    status: 'IN_USE',
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

const mockTrip: Trip = {
    id: 'trip-1',
    driverId: 'user-1',
    secondDriverId: null,
    driverName: 'Jean Dupont',
    driverEmail: 'jean@test.com',
    secondDriverName: null,
    secondDriverEmail: null,
    missionType: 'DPS',
    missionName: null,
    checkOutAt: new Date().toISOString(),
    checkInAt: null,
    mileageOut: 12000,
    mileageIn: null,
    fuelOut: 80,
    fuelIn: null,
    parkingOut: 'Place A-1',
    parkingIn: null,
    conditionOut: 'Bon état',
    conditionIn: null,
    cleanlinessOut: 'Propre',
    cleanlinessIn: null,
    dsaChecked: false,
    commentsOut: null,
    commentsIn: null,
    incident: null,
    parkingPhoto: null,
    driveFolderId: null,
    renaultDataValidated: null,
    renaultLastCheckedAt: null,
    desinfResponsable: null,
    desinfLotNumber: null,
    desinfType: null,
    desinfResponsableId: null,
};

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url.includes('/api/ul')) {
        return new Response(JSON.stringify({ uls: [] }), { status: 200 });
    }
    if (url.includes('/checklist')) {
        return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes('/api/users')) {
        return new Response(JSON.stringify({ users: [] }), { status: 200 });
    }
    if (url.includes('/checkin') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
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

describe('CheckInModal', () => {
    it('affiche les informations du trajet en cours', async () => {
        mockFetch();
        render(<CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByText('Jean Dupont', { exact: false })).toBeTruthy();
        expect(screen.getByText('DPS', { exact: false })).toBeTruthy();
    });

    it('pré-remplit le kilométrage et le carburant avec les valeurs actuelles du véhicule', async () => {
        mockFetch();
        render(<CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByDisplayValue('12000')).toBeTruthy();
    });

    it('masque le champ kilométrage manuel pour un véhicule connecté (données Renault en autopilote)', async () => {
        mockFetch(async (input) => {
            const url = getUrl(input);
            if (url.includes('/api/renault/')) {
                return new Response(JSON.stringify({ totalMileage: 12500, fuelQuantity: 20 }), { status: 200 });
            }
            return defaultFetchHandler(input);
        });

        const connectedVehicle = { ...mockVehicle, vin: 'VF1AB123456789012' };
        render(<CheckInModal vehicle={connectedVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />);

        await waitFor(() => expect(screen.queryByText(/Chargement.../)).toBeNull());
        expect(screen.queryByLabelText(/Kilométrage actuel/)).toBeNull();
        expect(screen.getByText('Saisir manuellement le kilométrage/carburant')).toBeTruthy();
    });

    it('soumet le retour du véhicule et appelle onSuccess (happy path)', async () => {
        const fetchMock = mockFetch();
        const onSuccess = vi.fn();
        const onRefetch = vi.fn();

        render(<CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={onSuccess} onRefetch={onRefetch} />);

        await screen.findByDisplayValue('12000');
        fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));

        await waitFor(() => {
            expect(onSuccess).toHaveBeenCalled();
            expect(onRefetch).toHaveBeenCalled();
        });

        const patchCall = fetchMock.mock.calls.find(c => getUrl(c[0]).includes('/checkin') && (c[1] as RequestInit)?.method === 'PATCH');
        expect(patchCall).toBeTruthy();
        const body = JSON.parse((patchCall![1] as RequestInit).body as string);
        expect(body.conditionIn).toBe('Bon état');
    });

    it('affiche l\'animation de succès au lieu de fermer directement pour l\'UL Paris 18', async () => {
        mockFetch();
        const onSuccess = vi.fn();

        render(
            <CheckInModal
                vehicle={mockVehicle}
                trip={mockTrip}
                onClose={vi.fn()}
                onSuccess={onSuccess}
                currentUserUlId="ul-paris-18"
            />
        );

        await screen.findByDisplayValue('12000');
        fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));

        await waitFor(() => expect(screen.getByAltText(/./)).toBeTruthy());
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('exige un responsable désigné pour une mission de désinfection', async () => {
        mockFetch();
        const desinfTrip = { ...mockTrip, missionType: 'Désinfection' };

        render(<CheckInModal vehicle={{ ...mockVehicle, type: 'VPSP' }} trip={desinfTrip} onClose={vi.fn()} onSuccess={vi.fn()} />);

        await screen.findByDisplayValue('12000');
        // Remplit le numéro de lot (champ natif requis) pour laisser la validation JS du responsable s'exécuter.
        fireEvent.change(screen.getByLabelText('Numéro de lot de désinf. *'), { target: { value: 'LOT-2026-001' } });
        fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));

        await waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith('Le responsable de la désinfection et le numéro de lot sont obligatoires.');
        });
    });

    it('affiche une alerte si l\'API échoue', async () => {
        mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (url.includes('/checkin') && init?.method === 'PATCH') {
                return new Response(JSON.stringify({ error: 'Kilométrage invalide' }), { status: 400 });
            }
            return defaultFetchHandler(input, init);
        });

        render(<CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />);

        await screen.findByDisplayValue('12000');
        fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));

        await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Kilométrage invalide'));
    });

    it('ouvre la modale de signalement d\'incident', async () => {
        mockFetch();
        render(<CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />);

        await screen.findByDisplayValue('12000');
        fireEvent.click(screen.getByRole('button', { name: '🚨 Signaler incident' }));

        expect(await screen.findByText('🚨 Déclarer un incident')).toBeTruthy();
    });
});
