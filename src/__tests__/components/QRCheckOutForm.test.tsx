import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CheckOutForm from '@/app/qr/[token]/CheckOutForm';
import type { QRVehicle } from '@/app/qr/[token]/types';

vi.mock('@/components/vehicle/ChecklistItems', () => ({
    default: () => null,
}));

const vehicle: QRVehicle = {
    id: 'VL001',
    name: 'VL186',
    plate: 'HJ-269-FE',
    type: 'VL',
    status: 'AVAILABLE',
    fuelLevel: 40,
    mileage: 12000,
    fuelType: 'Diesel',
    hasDSA: false,
    desinfTracking: false,
    parkingSpot: 'Place A-1',
    connection: null,
    maxFuelCapacity: 50,
    activeTrip: null,
};

let fetchMock: ReturnType<typeof vi.fn>;

function lastCheckoutBody(): Record<string, unknown> {
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/qr/tok-1/checkout'));
    return JSON.parse((call![1] as RequestInit).body as string);
}

describe('CheckOutForm (QR) — correction kilométrage / carburant', () => {
    beforeEach(() => {
        fetchMock = vi.fn((url: string) => {
            if (String(url).includes('/drivers')) {
                return Promise.resolve(new Response(JSON.stringify({
                    users: [{ id: 'usr-2', name: 'Marie Martin', email: 'marie@croix-rouge.fr' }],
                }), { status: 200 }));
            }
            return Promise.resolve(new Response(JSON.stringify({ tripId: 't1' }), { status: 201 }));
        });
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("affiche la case de correction, sans les champs tant qu'elle n'est pas cochée", () => {
        render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={vi.fn()} />);
        expect((screen.getByLabelText(/Le kilométrage et\/ou le niveau d'essence est erroné/) as HTMLInputElement).checked).toBe(false);
        expect(screen.queryByLabelText(/Kilométrage réel/)).toBeNull();
    });

    it('pré-remplit les champs avec les valeurs du véhicule une fois la case cochée', () => {
        render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByLabelText(/Le kilométrage et\/ou le niveau d'essence est erroné/));
        expect((screen.getByLabelText(/Kilométrage réel/) as HTMLInputElement).value).toBe('12000');
        expect((screen.getByLabelText(/Diesel réel : 40%/) as HTMLInputElement).value).toBe('40');
    });

    it('envoie les valeurs corrigées quand la case est cochée', async () => {
        const onSuccess = vi.fn();
        render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={onSuccess} />);
        fireEvent.click(screen.getByLabelText(/Le kilométrage et\/ou le niveau d'essence est erroné/));
        fireEvent.change(screen.getByLabelText(/Kilométrage réel/), { target: { value: '12500' } });
        fireEvent.change(screen.getByLabelText(/Diesel réel/), { target: { value: '70' } });
        fireEvent.click(screen.getByRole('button', { name: /Confirmer l'emprunt/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const body = lastCheckoutBody();
        expect(body.dataIncorrect).toBe(true);
        expect(body.correctedMileage).toBe(12500);
        expect(body.correctedFuel).toBe(70);
    });

    it("n'envoie aucune correction quand la case n'est pas cochée", async () => {
        const onSuccess = vi.fn();
        render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={onSuccess} />);
        fireEvent.click(screen.getByRole('button', { name: /Confirmer l'emprunt/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const body = lastCheckoutBody();
        expect(body.dataIncorrect).toBeUndefined();
        expect(body.correctedMileage).toBeUndefined();
        expect(body.correctedFuel).toBeUndefined();
    });

    it("n'envoie que la valeur modifiée (la télémétrie d'un véhicule connecté n'est pas écrasée)", async () => {
        const onSuccess = vi.fn();
        render(<CheckOutForm vehicle={{ ...vehicle, connection: { status: 'CONNECTED' } }} token="tok-1" onSuccess={onSuccess} />);
        fireEvent.click(screen.getByLabelText(/Saisir manuellement le kilométrage\/carburant/));
        fireEvent.change(screen.getByLabelText(/Diesel réel/), { target: { value: '70' } });
        fireEvent.click(screen.getByRole('button', { name: /Confirmer l'emprunt/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const body = lastCheckoutBody();
        expect(body.dataIncorrect).toBe(true);
        expect(body.correctedMileage).toBeUndefined();
        expect(body.correctedFuel).toBe(70);
    });

    it("ne signale rien si la case est cochée sans changer de valeur", async () => {
        const onSuccess = vi.fn();
        render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={onSuccess} />);
        fireEvent.click(screen.getByLabelText(/Le kilométrage et\/ou le niveau d'essence est erroné/));
        fireEvent.click(screen.getByRole('button', { name: /Confirmer l'emprunt/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(lastCheckoutBody().dataIncorrect).toBeUndefined();
    });

    it('un kilométrage vidé reste vide (et non 0)', () => {
        render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByLabelText(/Le kilométrage et\/ou le niveau d'essence est erroné/));
        const input = screen.getByLabelText(/Kilométrage réel/) as HTMLInputElement;
        fireEvent.change(input, { target: { value: '' } });
        expect(input.value).toBe('');
        expect(input.required).toBe(true);
    });

    it('charge les conducteurs proposables et envoie le 2ème conducteur choisi', async () => {
        const onSuccess = vi.fn();
        render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={onSuccess} />);
        expect(fetchMock).toHaveBeenCalledWith('/api/qr/tok-1/drivers');

        fireEvent.click(screen.getByRole('button', { name: /Aucun/ }));
        fireEvent.click(await screen.findByRole('option', { name: /Marie Martin/ }));
        fireEvent.click(screen.getByRole('button', { name: /Confirmer l'emprunt/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(lastCheckoutBody().secondDriverId).toBe('usr-2');
    });

    it("n'envoie pas de 2ème conducteur par défaut", async () => {
        const onSuccess = vi.fn();
        render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={onSuccess} />);
        fireEvent.click(screen.getByRole('button', { name: /Confirmer l'emprunt/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(lastCheckoutBody().secondDriverId).toBeUndefined();
    });

    it("véhicule connecté : ressaisir la valeur stockée est une vraie correction (la télémétrie peut différer)", async () => {
        const onSuccess = vi.fn();
        render(<CheckOutForm vehicle={{ ...vehicle, connection: { status: 'CONNECTED' } }} token="tok-1" onSuccess={onSuccess} />);
        fireEvent.click(screen.getByLabelText(/Saisir manuellement le kilométrage\/carburant/));
        const mileage = screen.getByLabelText(/Kilométrage réel/);
        fireEvent.change(mileage, { target: { value: '12001' } });
        fireEvent.change(mileage, { target: { value: '12000' } });
        fireEvent.click(screen.getByRole('button', { name: /Confirmer l'emprunt/ }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const body = lastCheckoutBody();
        expect(body.dataIncorrect).toBe(true);
        expect(body.correctedMileage).toBe(12000);
        expect(body.correctedFuel).toBeUndefined();
    });

    it("un kilométrage vidé n'est jamais envoyé (ni 0 ni chaîne vide)", async () => {
        const onSuccess = vi.fn();
        const { container } = render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={onSuccess} />);
        fireEvent.click(screen.getByLabelText(/Le kilométrage et\/ou le niveau d'essence est erroné/));
        fireEvent.change(screen.getByLabelText(/Kilométrage réel/), { target: { value: '' } });
        fireEvent.change(screen.getByLabelText(/Diesel réel/), { target: { value: '70' } });
        // Soumission programmatique : contourne le `required` du navigateur.
        fireEvent.submit(container.querySelector('form')!);

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        const body = lastCheckoutBody();
        expect(body.correctedMileage).toBeUndefined();
        expect(body.correctedFuel).toBe(70);
    });

    it('signale une saisie inférieure au kilométrage connu', () => {
        render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByLabelText(/Le kilométrage et\/ou le niveau d'essence est erroné/));
        expect(screen.queryByText(/Inférieur au kilométrage connu/)).toBeNull();
        fireEvent.change(screen.getByLabelText(/Kilométrage réel/), { target: { value: '1200' } });
        expect(screen.getByText(/Inférieur au kilométrage connu \(12.000 km\)/)).toBeTruthy();
    });

    describe('kilométrage corrigé à la baisse', () => {
        function mockDecreaseFlow() {
            let checkoutCalls = 0;
            fetchMock.mockImplementation((url: string) => {
                if (String(url).includes('/drivers')) {
                    return Promise.resolve(new Response(JSON.stringify({ users: [] }), { status: 200 }));
                }
                checkoutCalls += 1;
                if (checkoutCalls === 1) {
                    return Promise.resolve(new Response(JSON.stringify({
                        error: 'Le kilométrage saisi (1 200 km) est inférieur au kilométrage connu (12 000 km)',
                        code: 'MILEAGE_DECREASE_CONFIRM_REQUIRED',
                    }), { status: 400 }));
                }
                return Promise.resolve(new Response(JSON.stringify({ tripId: 't1' }), { status: 201 }));
            });
        }

        function checkoutBodies(): Record<string, unknown>[] {
            return fetchMock.mock.calls
                .filter(([url]) => String(url).includes('/checkout'))
                .map(([, init]) => JSON.parse((init as RequestInit).body as string));
        }

        function submitDecrease() {
            fireEvent.click(screen.getByLabelText(/Le kilométrage et\/ou le niveau d'essence est erroné/));
            fireEvent.change(screen.getByLabelText(/Kilométrage réel/), { target: { value: '1200' } });
            fireEvent.click(screen.getByRole('button', { name: /Confirmer l'emprunt/ }));
        }

        it('demande confirmation puis renvoie avec confirmMileageDecrease', async () => {
            mockDecreaseFlow();
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
            const onSuccess = vi.fn();
            render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={onSuccess} />);
            submitDecrease();

            await waitFor(() => expect(onSuccess).toHaveBeenCalled());
            expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('inférieur au kilométrage connu'));
            const bodies = checkoutBodies();
            expect(bodies).toHaveLength(2);
            expect(bodies[0].confirmMileageDecrease).toBeUndefined();
            expect(bodies[1].confirmMileageDecrease).toBe(true);
            expect(bodies[1].correctedMileage).toBe(1200);
            confirmSpy.mockRestore();
        });

        it("n'emprunte pas si l'utilisateur annule la confirmation", async () => {
            mockDecreaseFlow();
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
            const onSuccess = vi.fn();
            render(<CheckOutForm vehicle={vehicle} token="tok-1" onSuccess={onSuccess} />);
            submitDecrease();

            await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
            await waitFor(() => expect((screen.getByRole('button', { name: /Confirmer l'emprunt/ }) as HTMLButtonElement).disabled).toBe(false));
            expect(checkoutBodies()).toHaveLength(1);
            expect(onSuccess).not.toHaveBeenCalled();
            confirmSpy.mockRestore();
        });
    });

    it('propose la saisie manuelle pour un véhicule connecté', () => {
        render(<CheckOutForm vehicle={{ ...vehicle, connection: { status: 'CONNECTED' } }} token="tok-1" onSuccess={vi.fn()} />);
        expect(screen.getByLabelText(/Saisir manuellement le kilométrage\/carburant/)).toBeTruthy();
    });
});
