import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ConnectVehicleModal from '@/components/vehicle/modals/ConnectVehicleModal';

/** Réponse de `GET /api/brand-credentials` : compte présent ou absent pour l'UL. */
function mockFetch(credentialLogin: string | null, connectResponse?: { status: number; body: unknown }) {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
        const url = String(input);
        if (url.startsWith('/api/brand-credentials')) {
            return new Response(
                JSON.stringify({ credential: credentialLogin ? { brand: 'RENAULT', login: credentialLogin } : null }),
                { status: 200 },
            );
        }
        const r = connectResponse ?? { status: 200, body: { connection: {}, data: {} } };
        return new Response(JSON.stringify(r.body), { status: r.status });
    });
    vi.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
    return fetchMock;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ConnectVehicleModal', () => {
    it('sans compte enregistré : formulaire complet VIN + identifiant + mot de passe', async () => {
        mockFetch(null);
        render(
            <ConnectVehicleModal
                vehicleId="uuid-1"
                initialVin={null}
                mode="connect"
                onClose={vi.fn()}
                onConnected={vi.fn()}
            />,
        );

        expect(await screen.findByLabelText(/Identifiant MyRenault/)).toBeTruthy();
        expect(screen.getByLabelText(/Mot de passe/)).toBeTruthy();
        expect(screen.getByLabelText(/Numéro de châssis/)).toBeTruthy();
    });

    it('avec compte enregistré : formulaire réduit au VIN', async () => {
        mockFetch('ul@croix-rouge.fr');
        render(
            <ConnectVehicleModal
                vehicleId="uuid-1"
                initialVin={null}
                mode="connect"
                onClose={vi.fn()}
                onConnected={vi.fn()}
            />,
        );

        expect(await screen.findByText('ul@croix-rouge.fr')).toBeTruthy();
        expect(screen.getByLabelText(/Numéro de châssis/)).toBeTruthy();
        expect(screen.queryByLabelText(/Identifiant MyRenault/)).toBeNull();
        expect(screen.queryByLabelText(/Mot de passe/)).toBeNull();
    });

    it('« Utiliser un autre compte » rouvre la saisie avec l\'avertissement d\'écrasement', async () => {
        mockFetch('ul@croix-rouge.fr');
        render(
            <ConnectVehicleModal
                vehicleId="uuid-1"
                initialVin={null}
                mode="connect"
                onClose={vi.fn()}
                onConnected={vi.fn()}
            />,
        );

        fireEvent.click(await screen.findByRole('button', { name: 'Utiliser un autre compte' }));
        expect(screen.getByLabelText(/Identifiant MyRenault/)).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toContain('sur tous ses véhicules connectés');
    });

    it('soumet le VIN seul sur l\'UUID du véhicule et remonte la charge utile', async () => {
        const fetchMock = mockFetch('ul@croix-rouge.fr', {
            status: 200,
            body: { connection: { brand: 'RENAULT', vin: 'VF1AB123456789012', status: 'CONNECTED', connectedAt: 'x' }, data: { totalMileage: 1000 } },
        });
        const onConnected = vi.fn();
        render(
            <ConnectVehicleModal
                vehicleId="uuid-1"
                initialVin={null}
                mode="connect"
                onClose={vi.fn()}
                onConnected={onConnected}
            />,
        );

        fireEvent.change(await screen.findByLabelText(/Numéro de châssis/), { target: { value: 'vf1ab123456789012' } });
        fireEvent.click(screen.getByRole('button', { name: 'Connecter' }));

        await waitFor(() => expect(onConnected).toHaveBeenCalled());
        const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/vehicles/uuid-1/connection');
        expect(call).toBeTruthy();
        const init = call![1]!;
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual({ brand: 'RENAULT', vin: 'VF1AB123456789012' });
    });

    it('mode « edit » : PATCH, VIN pré-rempli, libellé « Enregistrer »', async () => {
        const fetchMock = mockFetch('ul@croix-rouge.fr');
        render(
            <ConnectVehicleModal
                vehicleId="uuid-1"
                initialVin="VF1AB123456789012"
                mode="edit"
                onClose={vi.fn()}
                onConnected={vi.fn()}
            />,
        );

        const vinInput = (await screen.findByLabelText(/Numéro de châssis/)) as HTMLInputElement;
        expect(vinInput.value).toBe('VF1AB123456789012');
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => {
            const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/vehicles/uuid-1/connection');
            expect(call![1]!.method).toBe('PATCH');
        });
    });

    it('erreur serveur : message affiché, modale ouverte, saisie conservée', async () => {
        mockFetch('ul@croix-rouge.fr', { status: 401, body: { error: 'Identifiants MyRenault refusés' } });
        const onClose = vi.fn();
        render(
            <ConnectVehicleModal
                vehicleId="uuid-1"
                initialVin={null}
                mode="connect"
                onClose={onClose}
                onConnected={vi.fn()}
            />,
        );

        fireEvent.change(await screen.findByLabelText(/Numéro de châssis/), { target: { value: 'VF1AB123456789012' } });
        fireEvent.click(screen.getByRole('button', { name: 'Connecter' }));

        expect(await screen.findByText('Identifiants MyRenault refusés')).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();
        expect((screen.getByLabelText(/Numéro de châssis/) as HTMLInputElement).value).toBe('VF1AB123456789012');
    });

    it('aucun retry : le bouton est désactivé pendant l\'appel (pré-mortem P3)', async () => {
        let release: (v: Response) => void = () => { };
        const pending = new Promise<Response>(res => { release = res; });
        vi.spyOn(global, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
            if (String(input).startsWith('/api/brand-credentials')) {
                return new Response(JSON.stringify({ credential: { brand: 'RENAULT', login: 'ul@croix-rouge.fr' } }), { status: 200 });
            }
            return pending;
        }) as unknown as typeof fetch);

        render(
            <ConnectVehicleModal
                vehicleId="uuid-1"
                initialVin="VF1AB123456789012"
                mode="connect"
                onClose={vi.fn()}
                onConnected={vi.fn()}
            />,
        );

        const submit = await screen.findByRole('button', { name: 'Connecter' });
        fireEvent.click(submit);
        await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(true));
        release(new Response(JSON.stringify({ connection: {}, data: {} }), { status: 200 }));
    });
});
