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
        fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tripId: 't1' }), { status: 201 }));
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

    it('propose la saisie manuelle pour un véhicule connecté', () => {
        render(<CheckOutForm vehicle={{ ...vehicle, connection: { status: 'CONNECTED' } }} token="tok-1" onSuccess={vi.fn()} />);
        expect(screen.getByLabelText(/Saisir manuellement le kilométrage\/carburant/)).toBeTruthy();
    });
});
