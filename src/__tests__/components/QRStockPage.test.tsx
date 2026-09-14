/**
 * Tests RTL — page publique `/qr-stock/[token]`.
 *
 * Couvre AC-I1 → AC-I11, dont AC-I6′ (forme exacte du corps posté).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPush = vi.fn();
// Le routeur doit être STABLE d'un rendu à l'autre : `fetchStock` est un
// `useCallback` qui en dépend, et un objet neuf à chaque rendu relancerait
// l'effet de chargement en boucle. Le vrai `useRouter` de Next est stable ;
// un mock qui ne l'est pas testerait un comportement qui n'existe pas.
const mockRouter = { push: mockPush };
vi.mock('next/navigation', () => ({
    useParams: () => ({ token: 'tok-1' }),
    useRouter: () => mockRouter,
}));

import QRStockPage from '@/app/qr-stock/[token]/page';

const STOCK = {
    stock: { id: 'stock-1', name: 'Pharmacie du VPSP' },
    items: [
        {
            id: 'item-1',
            name: 'Compresses',
            category: 'Pansements',
            quantity: 12,
            minStock: 5,
            batches: [
                { expiryDate: '2030-01-01', quantity: 8 },
                { expiryDate: null, quantity: 4 },
            ],
        },
        {
            id: 'item-2',
            name: 'Garrot',
            category: null,
            quantity: 0,
            minStock: null,
            batches: [],
        },
    ],
};

function mockFetch(impl?: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
        if (impl) return impl(url, init);
        if (url.includes('/stock')) {
            return new Response(JSON.stringify(STOCK), { status: 200 });
        }
        return new Response(JSON.stringify({ success: true, applied: 1 }), { status: 200 });
    });
    global.fetch = fn as unknown as typeof fetch;
    return fn;
}

/** Rend la page et attend la fin du chargement initial. */
async function renderPage() {
    render(<QRStockPage />);
    await screen.findByText('Pharmacie du VPSP');
}

beforeEach(() => {
    mockPush.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('QRStockPage', () => {
    it('affiche le nom du stock et le bandeau de périmètre (AC-I1)', async () => {
        mockFetch();
        await renderPage();

        expect(screen.getByText('Pharmacie du VPSP')).toBeTruthy();
        expect(screen.getByText(/limité à ce stock uniquement/i)).toBeTruthy();
        expect(screen.getByText('Compresses')).toBeTruthy();
        expect(screen.getByText('12')).toBeTruthy();
    });

    it('n\'expose AUCUN contrôle de création, modification ou suppression d\'article (AC-I2)', async () => {
        mockFetch();
        await renderPage();

        expect(screen.queryByText(/nouvel article/i)).toBeNull();
        expect(screen.queryByText(/ajouter un article/i)).toBeNull();
        expect(screen.queryByTitle(/supprimer/i)).toBeNull();
        expect(screen.queryByTitle(/modifier/i)).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('ajoute un retrait au panier sans aucun appel réseau (AC-I3)', async () => {
        const fetchMock = mockFetch();
        await renderPage();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByLabelText('Retirer une unité de Compresses'));

        expect(screen.getByText(/Mouvements en attente \(1\)/)).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('ouvre le sélecteur de lot sur « + », avec les lots FEFO et un nouveau lot (AC-I4)', async () => {
        mockFetch();
        await renderPage();

        fireEvent.click(screen.getByLabelText('Ajouter une unité de Compresses'));

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText(/Lot du 01\/01\/2030/)).toBeTruthy();
        expect(within(dialog).getByText('Stock sans date')).toBeTruthy();
        expect(within(dialog).getByLabelText('Nouveau lot').getAttribute('type')).toBe('date');
    });

    it('retire un seul mouvement du récapitulatif et laisse les autres (AC-I5)', async () => {
        mockFetch();
        await renderPage();

        fireEvent.click(screen.getByLabelText('Retirer une unité de Compresses'));
        fireEvent.click(screen.getByLabelText('Ajouter une unité de Garrot'));
        fireEvent.click(within(screen.getByRole('dialog')).getByText('Stock sans date'));

        expect(screen.getByText(/Mouvements en attente \(2\)/)).toBeTruthy();

        fireEvent.click(screen.getByLabelText('Annuler le retrait de 1 sur Compresses'));

        expect(screen.getByText(/Mouvements en attente \(1\)/)).toBeTruthy();
        expect(screen.getByText(/Garrot — sans date/)).toBeTruthy();
    });

    it('affiche le delta en attente sur la ligne cliquée, et le retire à l\'annulation', async () => {
        mockFetch();
        await renderPage();

        // Aucun badge tant que rien n'est empilé.
        expect(screen.queryByTestId('pending-item-1')).toBeNull();

        fireEvent.click(screen.getByLabelText('Retirer une unité de Compresses'));
        expect(screen.getByTestId('pending-item-1').textContent).toBe('-1');

        fireEvent.click(screen.getByLabelText('Retirer une unité de Compresses'));
        expect(screen.getByTestId('pending-item-1').textContent).toBe('-2');

        // Le badge disparaît quand les mouvements de l'article s'annulent entre eux :
        // c'est le total qui compte, pas le nombre de lignes du panier.
        fireEvent.click(screen.getByLabelText('Ajouter une unité de Compresses'));
        fireEvent.click(within(screen.getByRole('dialog')).getByText('Stock sans date'));
        fireEvent.click(screen.getByLabelText('Ajouter une unité de Compresses'));
        fireEvent.click(within(screen.getByRole('dialog')).getByText('Stock sans date'));
        expect(screen.queryByTestId('pending-item-1')).toBeNull();
    });

    it('rend un article à 0 avec son « + » ACTIF (AC-I7)', async () => {
        mockFetch();
        await renderPage();

        expect(screen.getByText('Garrot')).toBeTruthy();
        expect((screen.getByLabelText('Ajouter une unité de Garrot') as HTMLButtonElement).disabled).toBe(false);
        // Le « − » est en revanche désactivé : rien à retirer.
        expect((screen.getByLabelText('Retirer une unité de Garrot') as HTMLButtonElement).disabled).toBe(true);
    });

    it('affiche une erreur serveur dans un encart inline, jamais via alert() (AC-I8)', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        mockFetch((url) => {
            if (url.includes('/stock')) return new Response(JSON.stringify(STOCK), { status: 200 });
            return new Response(JSON.stringify({ error: 'Données invalides' }), { status: 400 });
        });
        await renderPage();

        fireEvent.click(screen.getByLabelText('Retirer une unité de Compresses'));
        fireEvent.click(screen.getByRole('button', { name: 'Valider' }));

        expect(await screen.findByText('Données invalides')).toBeTruthy();
        expect(alertSpy).not.toHaveBeenCalled();
    });

    // S4 — sans cela, le bénévole corrige sa saisie avec un message rouge périmé
    // sous les yeux, et l'erreur survit jusqu'à l'écran de succès.
    it('permet de masquer l\'encart d\'erreur', async () => {
        mockFetch((url) => {
            if (url.includes('/stock')) return new Response(JSON.stringify(STOCK), { status: 200 });
            return new Response(JSON.stringify({ error: 'Données invalides' }), { status: 400 });
        });
        await renderPage();

        fireEvent.click(screen.getByLabelText('Retirer une unité de Compresses'));
        fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
        expect(await screen.findByText('Données invalides')).toBeTruthy();

        fireEvent.click(screen.getByLabelText('Masquer le message d\'erreur'));

        expect(screen.queryByText('Données invalides')).toBeNull();
    });

    it('efface l\'erreur précédente au début d\'une nouvelle validation', async () => {
        let echoue = true;
        mockFetch((url) => {
            if (url.includes('/stock')) return new Response(JSON.stringify(STOCK), { status: 200 });
            if (echoue) {
                echoue = false;
                return new Response(JSON.stringify({ error: 'Données invalides' }), { status: 400 });
            }
            return new Response(JSON.stringify({ success: true, applied: 1 }), { status: 200 });
        });
        await renderPage();

        fireEvent.click(screen.getByLabelText('Retirer une unité de Compresses'));
        fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
        expect(await screen.findByText('Données invalides')).toBeTruthy();

        // Seconde tentative réussie : l'écran de succès ne doit pas hériter du
        // message de la tentative précédente.
        fireEvent.click(screen.getByRole('button', { name: 'Valider' }));

        expect(await screen.findByText('1 mouvement enregistré')).toBeTruthy();
        expect(screen.queryByText('Données invalides')).toBeNull();
    });

    it('affiche un écran de succès, puis recharge le stock et vide le panier (AC-I9)', async () => {
        const fetchMock = mockFetch();
        await renderPage();

        fireEvent.click(screen.getByLabelText('Retirer une unité de Compresses'));
        fireEvent.click(screen.getByLabelText('Ajouter une unité de Garrot'));
        fireEvent.click(within(screen.getByRole('dialog')).getByText('Stock sans date'));
        fireEvent.click(screen.getByRole('button', { name: 'Valider' }));

        expect(await screen.findByText('2 mouvements enregistrés')).toBeTruthy();
        expect(screen.getByText('Compresses : -1')).toBeTruthy();
        expect(screen.getByText('Garrot : +1')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Retour' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        expect(await screen.findByText('Pharmacie du VPSP')).toBeTruthy();
        expect(screen.queryByText(/Mouvements en attente/)).toBeNull();
    });

    it('annonce que le panier est perdu si l\'on quitte avant de valider (AC-I10)', async () => {
        mockFetch();
        await renderPage();

        expect(screen.getByText(/perdus/i)).toBeTruthy();
    });

    // AC-I6′ — le défaut que ce test existe pour attraper ne serait apparu qu'au
    // premier essai manuel : le schéma Zod de la route est `.strict()`.
    it('poste UN seul appel, dont le corps ne contient que les 4 clés attendues (AC-I6′)', async () => {
        const fetchMock = mockFetch();
        await renderPage();

        fireEvent.click(screen.getByLabelText('Retirer une unité de Compresses'));
        fireEvent.click(screen.getByRole('button', { name: 'Valider' }));

        await screen.findByText('1 mouvement enregistré');

        const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
        expect(posts).toHaveLength(1);

        const [url, init] = posts[0];
        expect(url).toBe('/api/qr-stock/tok-1/adjust');
        const body = JSON.parse(init!.body as string);
        expect(Object.keys(body)).toEqual(['movements']);
        expect(body.movements).toHaveLength(1);
        expect(Object.keys(body.movements[0]).sort()).toEqual(['change', 'expiryDate', 'itemId', 'note']);
        expect(body.movements[0]).toMatchObject({ itemId: 'item-1', change: -1, expiryDate: null });
    });

    it('désactive « Valider » au 26ᵉ mouvement et invite à valider en deux fois (AC-I11)', async () => {
        mockFetch();
        await renderPage();

        const remove = screen.getByLabelText('Retirer une unité de Compresses');
        for (let i = 0; i < 25; i++) fireEvent.click(remove);
        expect((screen.getByRole('button', { name: 'Valider' }) as HTMLButtonElement).disabled).toBe(false);

        fireEvent.click(remove);

        expect(screen.getByText(/Mouvements en attente \(26\)/)).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Valider' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(/Validez une première fois/i)).toBeTruthy();
    });

    it('redirige vers /login en 401', async () => {
        mockFetch(() => new Response('', { status: 401 }));
        render(<QRStockPage />);

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith(
            '/login?callbackUrl=%2Fqr-stock%2Ftok-1',
        ));
    });

    it('affiche l\'erreur inline pour un token invalide', async () => {
        mockFetch(() => new Response(JSON.stringify({ error: 'QR Code invalide ou expiré' }), { status: 404 }));
        render(<QRStockPage />);

        expect(await screen.findByText('QR Code invalide ou expiré')).toBeTruthy();
    });
});
