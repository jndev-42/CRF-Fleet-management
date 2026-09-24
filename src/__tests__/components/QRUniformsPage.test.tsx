/**
 * Tests RTL — page `/qr-uniforms/[token]` (miroir de `QRUnitLocalePage.test.tsx`).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Token contenant des caractères à encoder : un segment décodé par `useParams`
// ne doit jamais être réinjecté brut dans une URL d'API.
const TOKEN = 'tok/../x?y';

vi.mock('next/navigation', () => ({
    useParams: vi.fn(() => ({ token: TOKEN })),
    useRouter: vi.fn(),
}));

vi.mock('next/image', () => ({
    default: ({ alt }: { alt: string }) => <span aria-label={alt} data-testid="crf-logo" />,
}));

import QRUniformsPage from '@/app/qr-uniforms/[token]/page';
import { useRouter } from 'next/navigation';

const mockPush = vi.fn();
// Routeur STABLE : `onUnauthorized` est un `useCallback` qui en dépend.
const mockRouter = { push: mockPush };
const ENCODED = encodeURIComponent(TOKEN);

const CATALOG = {
    ul: { id: 'ul-paris-18', name: 'Paris 18' },
    items: [{ id: 'polo', name: 'Polo', sizes: [{ id: 'polo-m', label: 'M', quantity: 3, available: 2 }] }],
};

function mockFetch(catalog: () => Response) {
    const fn = vi.fn(async (url: string) => {
        if (url.endsWith('/catalog')) return catalog();
        if (url.endsWith('/laundry')) return new Response(JSON.stringify({ pieces: [] }), { status: 200 });
        return new Response('{}', { status: 200 });
    });
    vi.spyOn(global, 'fetch').mockImplementation(fn as unknown as typeof fetch);
    return fn;
}

beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockClear();
    vi.mocked(useRouter).mockReturnValue(mockRouter as unknown as ReturnType<typeof useRouter>);
});

describe('QRUniformsPage', () => {
    it('affiche l\'état de chargement pendant le fetch', () => {
        vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
        render(<QRUniformsPage />);
        expect(screen.getByRole('status').textContent).toMatch(/Chargement/);
    });

    it('redirige vers /login avec le callbackUrl de la page sur 401', async () => {
        mockFetch(() => new Response(null, { status: 401 }));
        render(<QRUniformsPage />);
        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith(`/login?callbackUrl=${encodeURIComponent(`/qr-uniforms/${TOKEN}`)}`);
        });
    });

    it('interroge l\'API avec le token encodé', async () => {
        const fetchMock = mockFetch(() => new Response(JSON.stringify(CATALOG), { status: 200 }));
        render(<QRUniformsPage />);
        await screen.findByText('UL Paris 18');
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/qr-uniforms/${ENCODED}/laundry`));
        expect(fetchMock).toHaveBeenCalledWith(`/api/qr-uniforms/${ENCODED}/catalog`, expect.anything());
        for (const [url] of fetchMock.mock.calls) expect(String(url)).not.toContain('/../');
    });

    it('affiche l\'erreur de token inline', async () => {
        mockFetch(() => new Response(JSON.stringify({ error: 'QR Code invalide ou expiré' }), { status: 404 }));
        render(<QRUniformsPage />);
        expect((await screen.findByRole('alert')).textContent).toBe('QR Code invalide ou expiré');
        expect(mockPush).not.toHaveBeenCalled();
    });

    it('affiche le catalogue de l\'UL du token et la liste « À laver »', async () => {
        mockFetch(() => new Response(JSON.stringify(CATALOG), { status: 200 }));
        render(<QRUniformsPage />);
        expect(await screen.findByText('Polo')).toBeTruthy();
        expect(screen.getByText('Emprunter')).toBeTruthy();
        expect(await screen.findByText('Aucune pièce à laver.')).toBeTruthy();
    });
});
