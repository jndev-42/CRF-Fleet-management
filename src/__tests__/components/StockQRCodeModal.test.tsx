/**
 * Tests RTL — `StockQRCodeModal`.
 *
 * Couvre AC-Q4 → AC-Q6.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import StockQRCodeModal from '@/components/inventory/modals/StockQRCodeModal';

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url.includes('/qr-token') && init?.method === 'POST') {
        return new Response(JSON.stringify({ token: 'tok-stock-1' }), { status: 200 });
    }
    if (url.includes('/qr-token') && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ token: 'tok-stock-2' }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
}

function mockFetch(handler = defaultFetchHandler) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

function renderModal(userRoles: string[] = ['ADMIN']) {
    return render(
        <StockQRCodeModal
            onClose={vi.fn()}
            stockName="Pharmacie"
            stockId="stock-1"
            userRoles={userRoles}
        />
    );
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('StockQRCodeModal', () => {
    it('demande le token au montage et rend une URL /qr-stock/{token} (AC-Q4)', async () => {
        const fetchMock = mockFetch();
        renderModal(['CHVL']);

        expect(await screen.findByText(/\/qr-stock\/tok-stock-1/)).toBeTruthy();

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/inventory/stocks/stock-1/qr-token',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    /**
     * AC-Q4 — l'id du canvas doit être DISTINCT de celui de la modale véhicule :
     * `downloadQRCode` fait un `getElementById` global, et deux canvas partageant
     * le même id feraient télécharger le mauvais QR.
     */
    it('porte l\'id de canvas `qr-stock-code-canvas`, distinct de celui du véhicule (AC-Q4)', async () => {
        mockFetch();
        const { container } = renderModal();

        await screen.findByText(/\/qr-stock\/tok-stock-1/);

        expect(container.querySelector('#qr-stock-code-canvas')).toBeTruthy();
        expect(container.querySelector('#qr-code-canvas')).toBeNull();
    });

    it('masque « Régénérer » pour un non-admin (AC-Q5)', async () => {
        mockFetch();
        renderModal(['CHVL']);

        await screen.findByText(/\/qr-stock\/tok-stock-1/);
        expect(screen.queryByText(/Régénérer le QR Code/)).toBeNull();
    });

    it('affiche « Régénérer » pour un admin et remplace le token après confirmation (AC-Q5)', async () => {
        const fetchMock = mockFetch();
        renderModal(['ADMIN']);

        await screen.findByText(/\/qr-stock\/tok-stock-1/);
        fireEvent.click(screen.getByText(/Régénérer le QR Code/));

        expect(window.confirm).toHaveBeenCalled();
        expect(await screen.findByText(/\/qr-stock\/tok-stock-2/)).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/inventory/stocks/stock-1/qr-token',
            expect.objectContaining({ method: 'DELETE' }),
        );
    });

    it('n\'émet AUCUN DELETE si la confirmation est refusée (AC-Q6)', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const fetchMock = mockFetch();
        renderModal(['ADMIN']);

        await screen.findByText(/\/qr-stock\/tok-stock-1/);
        fireEvent.click(screen.getByText(/Régénérer le QR Code/));

        await waitFor(() => expect(window.confirm).toHaveBeenCalled());
        const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
        expect(deletes).toHaveLength(0);
        expect(screen.getByText(/\/qr-stock\/tok-stock-1/)).toBeTruthy();
    });

    it('affiche une erreur de régénération dans un encart inline, jamais via alert()', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (url.includes('/qr-token') && init?.method === 'DELETE') {
                return new Response(JSON.stringify({ error: 'Interdit' }), { status: 403 });
            }
            return new Response(JSON.stringify({ token: 'tok-stock-1' }), { status: 200 });
        });
        renderModal(['ADMIN']);

        await screen.findByText(/\/qr-stock\/tok-stock-1/);
        fireEvent.click(screen.getByText(/Régénérer le QR Code/));

        expect(await screen.findByText('Interdit')).toBeTruthy();
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it('avertit que le QR contourne les restrictions d\'UL et de rôle', async () => {
        mockFetch();
        renderModal();

        await screen.findByText(/\/qr-stock\/tok-stock-1/);
        expect(screen.getByText(/sans restriction d'UL/i)).toBeTruthy();
        expect(screen.getByText(/enregistré à son nom/i)).toBeTruthy();
    });
});
