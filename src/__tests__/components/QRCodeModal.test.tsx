import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import QRCodeModal from '@/components/vehicle/modals/QRCodeModal';

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url.includes('/qr-token') && init?.method === 'POST') {
        return new Response(JSON.stringify({ token: 'tok-abc123' }), { status: 200 });
    }
    if (url.includes('/qr-token') && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ token: 'tok-new456' }), { status: 200 });
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
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('QRCodeModal', () => {
    it('affiche le chargement puis le QR code généré', async () => {
        mockFetch();
        render(<QRCodeModal onClose={vi.fn()} vehicleName="VL186" vehicleId="VL001" userRoles={['CHVL']} />);

        expect(screen.getByText('⏳ Génération du QR Code...')).toBeTruthy();
        expect(await screen.findByText(/\/qr\/tok-abc123/)).toBeTruthy();
    });

    it('affiche une erreur avec un bouton réessayer si le fetch échoue', async () => {
        mockFetch(async () => new Response(JSON.stringify({ error: 'Véhicule non trouvé' }), { status: 404 }));
        render(<QRCodeModal onClose={vi.fn()} vehicleName="VL186" vehicleId="VL001" userRoles={['CHVL']} />);

        expect(await screen.findByText('Véhicule non trouvé')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    });

    it('copie le lien du QR code dans le presse-papier', async () => {
        mockFetch();
        render(<QRCodeModal onClose={vi.fn()} vehicleName="VL186" vehicleId="VL001" userRoles={['CHVL']} />);

        await screen.findByText(/\/qr\/tok-abc123/);
        fireEvent.click(screen.getByRole('button', { name: /Copier le lien du QR Code/ }));

        await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/qr/tok-abc123')));
        expect(await screen.findByText(/Lien copié/)).toBeTruthy();
    });

    it('masque le bouton de régénération pour un rôle non-admin', async () => {
        mockFetch();
        render(<QRCodeModal onClose={vi.fn()} vehicleName="VL186" vehicleId="VL001" userRoles={['CHVL']} />);

        await screen.findByText(/\/qr\/tok-abc123/);
        expect(screen.queryByRole('button', { name: /Régénérer le QR Code/ })).toBeNull();
    });

    it('régénère le QR code après confirmation (admin)', async () => {
        const fetchMock = mockFetch();
        render(<QRCodeModal onClose={vi.fn()} vehicleName="VL186" vehicleId="VL001" userRoles={['ADMIN']} />);

        await screen.findByText(/\/qr\/tok-abc123/);
        fireEvent.click(screen.getByRole('button', { name: /Régénérer le QR Code/ }));

        expect(window.confirm).toHaveBeenCalled();
        await waitFor(() => expect(screen.getByText(/\/qr\/tok-new456/)).toBeTruthy());
        const deleteCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'DELETE');
        expect(deleteCall).toBeTruthy();
    });

    it('appelle onClose au clic sur Fermer', async () => {
        mockFetch();
        const onClose = vi.fn();
        render(<QRCodeModal onClose={onClose} vehicleName="VL186" vehicleId="VL001" userRoles={['CHVL']} />);

        await screen.findByText(/\/qr\/tok-abc123/);
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(onClose).toHaveBeenCalled();
    });
});
