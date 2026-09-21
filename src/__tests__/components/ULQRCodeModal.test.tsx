/**
 * Tests RTL — `ULQRCodeModal`.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ULQRCodeModal from '@/components/admin/modals/ULQRCodeModal';

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url.includes('/qr-token') && init?.method === 'POST') {
        return new Response(JSON.stringify({ token: 'tok-ul-1' }), { status: 200 });
    }
    if (url.includes('/qr-token') && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ token: 'tok-ul-2' }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
}

function mockFetch(handler = defaultFetchHandler) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

function renderModal(canRegenerate = true, onClose = vi.fn()) {
    return render(
        <ULQRCodeModal
            onClose={onClose}
            ulName="Unité Locale Paris 18"
            ulId="ul-paris-18"
            canRegenerate={canRegenerate}
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

describe('ULQRCodeModal', () => {
    it('demande le token au montage et rend une URL /qr-ul/{token}', async () => {
        const fetchMock = mockFetch();
        renderModal();

        expect(screen.getByText('⏳ Génération du QR Code...')).toBeTruthy();
        expect(await screen.findByText(/\/qr-ul\/tok-ul-1/)).toBeTruthy();

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/ul/ul-paris-18/qr-token',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    /**
     * L'id du canvas doit être DISTINCT de celui de la modale véhicule :
     * `downloadQRCode` fait un `getElementById` global, et deux canvas partageant
     * le même id feraient télécharger le mauvais QR.
     */
    it('porte l\'id de canvas `qr-ul-code-canvas`, distinct de celui du véhicule', async () => {
        mockFetch();
        const { container } = renderModal();

        await screen.findByText(/\/qr-ul\/tok-ul-1/);

        expect(container.querySelector('#qr-ul-code-canvas')).toBeTruthy();
        expect(container.querySelector('#qr-code-canvas')).toBeNull();
    });

    it('propose le téléchargement du QR Code une fois le token chargé', async () => {
        mockFetch();
        renderModal();

        await screen.findByText(/\/qr-ul\/tok-ul-1/);
        const downloadBtn = screen.getByRole('button', { name: 'Télécharger' }) as HTMLButtonElement;
        expect(downloadBtn.disabled).toBe(false);
    });

    it('copie le lien du QR Code dans le presse-papier', async () => {
        mockFetch();
        renderModal();

        await screen.findByText(/\/qr-ul\/tok-ul-1/);
        fireEvent.click(screen.getByRole('button', { name: 'Copier le lien du QR Code' }));

        await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            expect.stringContaining('/qr-ul/tok-ul-1'),
        ));
        expect(await screen.findByText('Lien copié !')).toBeTruthy();
    });

    it('masque « Régénérer » quand canRegenerate est faux', async () => {
        mockFetch();
        renderModal(false);

        await screen.findByText(/\/qr-ul\/tok-ul-1/);
        expect(screen.queryByText(/Régénérer le QR Code/)).toBeNull();
    });

    it('affiche « Régénérer » quand canRegenerate est vrai et remplace le token après confirmation', async () => {
        const fetchMock = mockFetch();
        renderModal(true);

        await screen.findByText(/\/qr-ul\/tok-ul-1/);
        fireEvent.click(screen.getByText(/Régénérer le QR Code/));

        expect(window.confirm).toHaveBeenCalled();
        expect(await screen.findByText(/\/qr-ul\/tok-ul-2/)).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/ul/ul-paris-18/qr-token',
            expect.objectContaining({ method: 'DELETE' }),
        );
    });

    it('n\'émet AUCUN DELETE si la confirmation est refusée', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const fetchMock = mockFetch();
        renderModal(true);

        await screen.findByText(/\/qr-ul\/tok-ul-1/);
        fireEvent.click(screen.getByText(/Régénérer le QR Code/));

        await waitFor(() => expect(window.confirm).toHaveBeenCalled());
        const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
        expect(deletes).toHaveLength(0);
        expect(screen.getByText(/\/qr-ul\/tok-ul-1/)).toBeTruthy();
    });

    it('affiche une erreur avec un bouton Réessayer si le chargement échoue', async () => {
        mockFetch(async () => new Response(JSON.stringify({ error: 'UL introuvable' }), { status: 404 }));
        renderModal();

        expect(await screen.findByText('UL introuvable')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    });

    it('explique que le QR sert à déposer un compte rendu de mission sans restriction d\'UL ni de rôle', async () => {
        mockFetch();
        renderModal();

        await screen.findByText(/\/qr-ul\/tok-ul-1/);
        expect(screen.getByText(/compte rendu de mission/i)).toBeTruthy();
        expect(screen.getByText(/sans restriction d'UL/i)).toBeTruthy();
    });

    it('appelle onClose au clic sur Fermer', async () => {
        mockFetch();
        const onClose = vi.fn();
        renderModal(true, onClose);

        await screen.findByText(/\/qr-ul\/tok-ul-1/);
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(onClose).toHaveBeenCalled();
    });
});
