import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CheckInModal from '@/components/vehicle/modals/CheckInModal';
import { uploadFilesToDriveSafely } from '@/lib/imageCompression';
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

    describe('contrôle de plausibilité du kilométrage', () => {
        /** Injecte une photo dans le PhotoPicker (compressImages est mocké en identité). */
        function pickPhoto(container: HTMLElement) {
            const fileInput = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
            fireEvent.change(fileInput, {
                target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] },
            });
        }

        it('bloque la soumission et affiche le message quand le km est inférieur au départ', async () => {
            const fetchMock = mockFetch();
            render(<CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />);

            await screen.findByDisplayValue('12000');
            fireEvent.change(screen.getByLabelText(/Kilométrage actuel/), { target: { value: '11000' } });

            expect(screen.getByText(/inférieur au kilométrage de départ/)).toBeTruthy();
            const submit = screen.getByRole('button', { name: /Rendre le véhicule/ }) as HTMLButtonElement;
            expect(submit.disabled).toBe(true);

            fireEvent.click(submit);
            await waitFor(() => {
                expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit)?.method === 'PATCH')).toBe(false);
            });
        });

        it('ouvre la modale de confirmation sans envoyer de requête quand le delta est excessif', async () => {
            const fetchMock = mockFetch();
            render(<CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />);

            await screen.findByDisplayValue('12000');
            fireEvent.change(screen.getByLabelText(/Kilométrage actuel/), { target: { value: '12400' } });
            fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));

            expect(await screen.findByText('⚠️ Kilométrage inhabituel')).toBeTruthy();
            expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit)?.method === 'PATCH')).toBe(false);

            fireEvent.click(screen.getByRole('button', { name: 'Confirmer quand même' }));

            await waitFor(() => {
                const patchCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'PATCH');
                expect(patchCall).toBeTruthy();
                const body = JSON.parse((patchCall![1] as RequestInit).body as string);
                expect(body.confirmMileageAnomaly).toBe(true);
                expect(body.mileageIn).toBe(12400);
            });
        });

        it('« Corriger » ferme la modale sans envoyer de requête', async () => {
            const fetchMock = mockFetch();
            render(<CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />);

            await screen.findByDisplayValue('12000');
            fireEvent.change(screen.getByLabelText(/Kilométrage actuel/), { target: { value: '12400' } });
            fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));

            await screen.findByText('⚠️ Kilométrage inhabituel');
            fireEvent.click(screen.getByRole('button', { name: 'Corriger' }));

            await waitFor(() => expect(screen.queryByText('⚠️ Kilométrage inhabituel')).toBeNull());
            expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit)?.method === 'PATCH')).toBe(false);
        });

        it("n'envoie aucune photo sur Drive avant la confirmation", async () => {
            mockFetch();
            const { container } = render(
                <CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />
            );

            await screen.findByDisplayValue('12000');
            pickPhoto(container);
            fireEvent.change(screen.getByLabelText(/Kilométrage actuel/), { target: { value: '12400' } });
            fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));

            await screen.findByText('⚠️ Kilométrage inhabituel');
            expect(uploadFilesToDriveSafely).not.toHaveBeenCalled();
        });

        it('ne ré-uploade pas les photos lors du rejeu après un 400 serveur', async () => {
            let patchCount = 0;
            const fetchMock = mockFetch(async (input, init) => {
                const url = getUrl(input);
                if (url.includes('/checkin') && init?.method === 'PATCH') {
                    patchCount += 1;
                    if (patchCount === 1) {
                        return new Response(
                            JSON.stringify({
                                error: 'Kilométrage inhabituel, confirmation requise.',
                                code: 'MILEAGE_CONFIRM_REQUIRED',
                                delta: 480,
                                maxKm: 300,
                                durationLabel: '2 jours',
                            }),
                            { status: 400 }
                        );
                    }
                    return new Response(JSON.stringify({ success: true }), { status: 200 });
                }
                return defaultFetchHandler(input, init);
            });

            const { container } = render(
                <CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />
            );

            await screen.findByDisplayValue('12000');
            pickPhoto(container);
            // Delta 100 : sous le seuil local, donc le 400 vient bien du serveur (dérive d'horloge simulée).
            fireEvent.change(screen.getByLabelText(/Kilométrage actuel/), { target: { value: '12100' } });
            fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));

            // La modale est peuplée depuis le corps 400, jamais par recalcul local.
            expect(await screen.findByText('⚠️ Kilométrage inhabituel')).toBeTruthy();
            expect(screen.getByText(/480 km parcourus en 2 jours/)).toBeTruthy();
            expect(screen.getByText(/Plafond attendu : 300 km/)).toBeTruthy();

            fireEvent.click(screen.getByRole('button', { name: 'Confirmer quand même' }));

            await waitFor(() => expect(patchCount).toBe(2));
            expect(uploadFilesToDriveSafely).toHaveBeenCalledTimes(1);

            const patchCalls = fetchMock.mock.calls.filter(c => (c[1] as RequestInit)?.method === 'PATCH');
            const secondBody = JSON.parse((patchCalls[1][1] as RequestInit).body as string);
            expect(secondBody.confirmMileageAnomaly).toBe(true);
        });

        it('réarme la confirmation après correction du kilométrage (garde anti-boucle non collant)', async () => {
            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
            // Le serveur refuse systématiquement : simule une divergence structurelle front/serveur.
            const fetchMock = mockFetch(async (input, init) => {
                const url = getUrl(input);
                if (url.includes('/checkin') && init?.method === 'PATCH') {
                    return new Response(
                        JSON.stringify({
                            error: 'Kilométrage inhabituel, confirmation requise.',
                            code: 'MILEAGE_CONFIRM_REQUIRED',
                            delta: 480,
                            maxKm: 300,
                            durationLabel: '2 jours',
                        }),
                        { status: 400 }
                    );
                }
                return defaultFetchHandler(input, init);
            });

            render(<CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />);
            await screen.findByDisplayValue('12000');

            // Delta 100 : sous le seuil local, le 400 vient donc du serveur.
            fireEvent.change(screen.getByLabelText(/Kilométrage actuel/), { target: { value: '12100' } });
            fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));
            await screen.findByText('⚠️ Kilométrage inhabituel');

            // Confirmation : le second 400 doit tomber dans le garde anti-boucle (alerte brute).
            fireEvent.click(screen.getByRole('button', { name: 'Confirmer quand même' }));
            await waitFor(() => expect(alertSpy).toHaveBeenCalled());
            expect(screen.queryByText('⚠️ Kilométrage inhabituel')).toBeNull();

            // L'utilisateur corrige : le garde doit être réarmé, sinon plus aucune
            // anomalie ultérieure ne serait confirmable et le véhicule resterait IN_USE.
            fireEvent.change(screen.getByLabelText(/Kilométrage actuel/), { target: { value: '12050' } });
            fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));

            expect(await screen.findByText('⚠️ Kilométrage inhabituel')).toBeTruthy();
            expect(fetchMock.mock.calls.filter(c => (c[1] as RequestInit)?.method === 'PATCH').length).toBe(3);
            alertSpy.mockRestore();
        });

        it('ré-uploade les photos si le jeu de photos change après un 400', async () => {
            // Le compteur du module mocké n'est pas remis à zéro par restoreAllMocks :
            // sans ce clear, l'assertion s'appuierait sur les appels des tests précédents.
            vi.mocked(uploadFilesToDriveSafely).mockClear();
            let patchCount = 0;
            mockFetch(async (input, init) => {
                const url = getUrl(input);
                if (url.includes('/checkin') && init?.method === 'PATCH') {
                    patchCount += 1;
                    if (patchCount === 1) {
                        return new Response(
                            JSON.stringify({
                                error: 'Kilométrage inhabituel, confirmation requise.',
                                code: 'MILEAGE_CONFIRM_REQUIRED',
                                delta: 480,
                                maxKm: 300,
                                durationLabel: '2 jours',
                            }),
                            { status: 400 }
                        );
                    }
                    return new Response(JSON.stringify({ success: true }), { status: 200 });
                }
                return defaultFetchHandler(input, init);
            });

            const { container } = render(
                <CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />
            );
            await screen.findByDisplayValue('12000');

            // PhotoPicker met son état à jour de façon asynchrone (compressImages) :
            // attendre l'aperçu, sinon la soumission part avec photos = [] et n'uploade rien.
            pickPhoto(container);
            await waitFor(() => expect(screen.getAllByAltText('Aperçu').length).toBe(1));

            // Delta 100 : sous le seuil local, le 400 vient donc du serveur.
            fireEvent.change(screen.getByLabelText(/Kilométrage actuel/), { target: { value: '12100' } });
            fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));

            await screen.findByText('⚠️ Kilométrage inhabituel');
            expect(uploadFilesToDriveSafely).toHaveBeenCalledTimes(1);

            fireEvent.click(screen.getByRole('button', { name: 'Corriger' }));
            await waitFor(() => expect(screen.queryByText('⚠️ Kilométrage inhabituel')).toBeNull());

            // Nouveau jeu de photos : le dossier Drive déjà créé ne correspond plus.
            // Sans invalidation du ref, cette photo ne partirait jamais, sans erreur.
            pickPhoto(container);
            await waitFor(() => expect(screen.getAllByAltText('Aperçu').length).toBe(2));

            fireEvent.click(screen.getByRole('button', { name: /Rendre le véhicule/ }));

            await waitFor(() => expect(patchCount).toBe(2));
            expect(uploadFilesToDriveSafely).toHaveBeenCalledTimes(2);
        });
    });

    it('ouvre la modale de signalement d\'incident', async () => {
        mockFetch();
        render(<CheckInModal vehicle={mockVehicle} trip={mockTrip} onClose={vi.fn()} onSuccess={vi.fn()} />);

        await screen.findByDisplayValue('12000');
        fireEvent.click(screen.getByRole('button', { name: '🚨 Signaler incident' }));

        expect(await screen.findByText('🚨 Déclarer un incident')).toBeTruthy();
    });
});
