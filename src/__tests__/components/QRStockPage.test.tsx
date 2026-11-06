/**
 * Tests RTL — page publique `/qr-stock/[token]`.
 *
 * Couvre AC-I1 → AC-I11, dont AC-I6′ (forme exacte du corps posté).
 */
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
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
    total: 2,
    hasMore: false,
};

// jsdom n'a pas IntersectionObserver : on le stubbe et on déclenche à la main.
type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
let observers: IOCallback[] = [];
async function triggerIntersection() {
    // L'observateur est créé par un effet : attendre qu'il existe avant de le déclencher.
    await waitFor(() => expect(observers.length).toBeGreaterThan(0));
    const last = observers[observers.length - 1];
    act(() => last?.([{ isIntersecting: true }]));
}

function makeItem(i: number) {
    return { id: `p-${i}`, name: `Article ${i}`, category: null, quantity: 1, minStock: null, batches: [] };
}

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
    observers = [];
    class FakeIntersectionObserver {
        constructor(cb: IOCallback) { observers.push(cb); }
        observe() {}
        disconnect() {}
        unobserve() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
    vi.unstubAllGlobals();
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

    describe('recherche et scroll infini', () => {
        const stockUrl = (u: string) => new URL(u, 'http://localhost');

        it('envoie q au serveur après le debounce, une seule fois malgré plusieurs frappes', async () => {
            const fetchMock = mockFetch();
            await renderPage();

            const input = screen.getByLabelText('Rechercher un article');
            for (const v of ['g', 'ga', 'gar', 'garr']) fireEvent.change(input, { target: { value: v } });

            await waitFor(() => {
                const qs = fetchMock.mock.calls.map(([u]) => stockUrl(u as string).searchParams.get('q'));
                expect(qs).toContain('garr');
            });
            const searches = fetchMock.mock.calls
                .map(([u]) => stockUrl(u as string).searchParams.get('q'))
                .filter(q => q !== null);
            expect(searches).toEqual(['garr']);
        });

        it('ignore la réponse obsolète d\'une recherche précédente', async () => {
            let releaseSlow: (() => void) | null = null;
            mockFetch((url) => {
                const q = stockUrl(url).searchParams.get('q');
                if (q === 'comp') {
                    // Réponse lente : arrive APRÈS celle de la recherche suivante.
                    return new Promise<Response>(resolve => {
                        releaseSlow = () => resolve(new Response(JSON.stringify({ ...STOCK, items: [STOCK.items[0]], total: 1 }), { status: 200 }));
                    });
                }
                const items = q === 'garr' ? [STOCK.items[1]] : STOCK.items;
                return new Response(JSON.stringify({ ...STOCK, items, total: items.length }), { status: 200 });
            });
            await renderPage();

            const input = screen.getByLabelText('Rechercher un article');
            fireEvent.change(input, { target: { value: 'comp' } });
            await waitFor(() => expect(releaseSlow).not.toBeNull());
            fireEvent.change(input, { target: { value: 'garr' } });
            await waitFor(() => expect(screen.queryByText('Compresses')).toBeNull());
            expect(await screen.findByText('Garrot')).toBeTruthy();

            await act(async () => { releaseSlow?.(); });
            expect(screen.queryByText('Compresses')).toBeNull();
            expect(screen.getByText('Garrot')).toBeTruthy();
        });

        it('conserve q sur la page suivante', async () => {
            const matches = Array.from({ length: 30 }, (_, i) => makeItem(i + 1));
            const fetchMock = mockFetch((url) => {
                const u = stockUrl(url);
                const offset = Number(u.searchParams.get('offset') ?? 0);
                if (!u.searchParams.get('q')) return new Response(JSON.stringify(STOCK), { status: 200 });
                const body = offset === 0
                    ? { ...STOCK, items: matches, total: 31, hasMore: true }
                    : { ...STOCK, items: [makeItem(31)], total: 31, hasMore: false };
                return new Response(JSON.stringify(body), { status: 200 });
            });
            await renderPage();

            fireEvent.change(screen.getByLabelText('Rechercher un article'), { target: { value: 'article' } });
            await screen.findByText('Article 1');
            await triggerIntersection();

            await screen.findByText('Article 31');
            const next = fetchMock.mock.calls
                .map(([u]) => stockUrl(u as string))
                .find(u => u.searchParams.get('offset') === '30');
            expect(next?.searchParams.get('q')).toBe('article');
        });

        it('garde la barre de recherche et le panier si une recherche échoue', async () => {
            mockFetch((url) => {
                if (stockUrl(url).searchParams.get('q')) {
                    return new Response(JSON.stringify({ error: 'Panne serveur' }), { status: 500 });
                }
                return new Response(JSON.stringify(STOCK), { status: 200 });
            });
            await renderPage();
            fireEvent.click(screen.getByLabelText('Retirer une unité de Compresses'));

            fireEvent.change(screen.getByLabelText('Rechercher un article'), { target: { value: 'x' } });

            expect(await screen.findByText('Panne serveur')).toBeTruthy();
            expect(screen.getByLabelText('Rechercher un article')).toBeTruthy();
            expect(screen.getByText(/Mouvements en attente \(1\)/)).toBeTruthy();
        });

        it('charge la page suivante (offset=30) quand la sentinelle devient visible', async () => {
            const first = Array.from({ length: 30 }, (_, i) => makeItem(i + 1));
            const second = Array.from({ length: 5 }, (_, i) => makeItem(i + 31));
            const fetchMock = mockFetch((url) => {
                const offset = Number(stockUrl(url).searchParams.get('offset') ?? 0);
                const body = offset === 0
                    ? { ...STOCK, items: first, total: 35, hasMore: true }
                    : { ...STOCK, items: second, total: 35, hasMore: false };
                return new Response(JSON.stringify(body), { status: 200 });
            });
            await renderPage();
            expect(screen.queryByText('Article 31')).toBeNull();

            await triggerIntersection();

            expect(await screen.findByText('Article 31')).toBeTruthy();
            expect(screen.getByText('Article 1')).toBeTruthy();
            expect(fetchMock.mock.calls.some(([u]) => stockUrl(u as string).searchParams.get('offset') === '30')).toBe(true);
        });

        it('conserve le panier après une recherche puis son effacement', async () => {
            mockFetch((url) => {
                const q = stockUrl(url).searchParams.get('q');
                const items = q ? STOCK.items.filter(i => i.name.toLowerCase().includes(q)) : STOCK.items;
                return new Response(JSON.stringify({ ...STOCK, items, total: items.length }), { status: 200 });
            });
            await renderPage();

            fireEvent.click(screen.getByLabelText('Ajouter une unité de Garrot'));
            fireEvent.click(within(screen.getByRole('dialog')).getByText('Stock sans date'));
            expect(screen.getByTestId('pending-item-2').textContent).toBe('+1');

            fireEvent.change(screen.getByLabelText('Rechercher un article'), { target: { value: 'compresse' } });
            await waitFor(() => expect(screen.queryByText('Garrot')).toBeNull());
            expect(screen.getByText(/Mouvements en attente \(1\)/)).toBeTruthy();

            fireEvent.click(screen.getByLabelText('Effacer la recherche'));
            expect(await screen.findByText('Garrot')).toBeTruthy();
            expect(screen.getByTestId('pending-item-2').textContent).toBe('+1');
            expect(screen.getByText(/Mouvements en attente \(1\)/)).toBeTruthy();
        });

        it('affiche un état vide propre à la recherche', async () => {
            mockFetch((url) => {
                const q = stockUrl(url).searchParams.get('q');
                const body = q ? { ...STOCK, items: [], total: 0 } : STOCK;
                return new Response(JSON.stringify(body), { status: 200 });
            });
            await renderPage();

            fireEvent.change(screen.getByLabelText('Rechercher un article'), { target: { value: 'zzz' } });

            expect(await screen.findByText('Aucun article ne correspond à « zzz »')).toBeTruthy();
        });

        it('conserve les articles chargés et propose « Réessayer » si la page suivante échoue', async () => {
            const first = Array.from({ length: 30 }, (_, i) => makeItem(i + 1));
            let fail = true;
            mockFetch((url) => {
                const offset = Number(stockUrl(url).searchParams.get('offset') ?? 0);
                if (offset === 0) {
                    return new Response(JSON.stringify({ ...STOCK, items: first, total: 31, hasMore: true }), { status: 200 });
                }
                if (fail) {
                    fail = false;
                    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500 });
                }
                return new Response(JSON.stringify({ ...STOCK, items: [makeItem(31)], total: 31, hasMore: false }), { status: 200 });
            });
            await renderPage();

            await triggerIntersection();
            expect(await screen.findByText('Erreur réseau')).toBeTruthy();
            expect(screen.getByText('Article 1')).toBeTruthy();

            fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

            expect(await screen.findByText('Article 31')).toBeTruthy();
            expect(screen.queryByText('Erreur réseau')).toBeNull();
        });

        it('recharge depuis la page 0 en gardant la recherche après « Retour »', async () => {
            const fetchMock = mockFetch();
            await renderPage();

            fireEvent.change(screen.getByLabelText('Rechercher un article'), { target: { value: 'garr' } });
            await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => stockUrl(u as string).searchParams.get('q') === 'garr')).toBe(true));
            await screen.findByText('Garrot');

            fireEvent.click(screen.getByLabelText('Ajouter une unité de Garrot'));
            fireEvent.click(within(screen.getByRole('dialog')).getByText('Stock sans date'));
            fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
            await screen.findByText('1 mouvement enregistré');

            fetchMock.mockClear();
            fireEvent.click(screen.getByRole('button', { name: 'Retour' }));

            await waitFor(() => expect(fetchMock).toHaveBeenCalled());
            const u = stockUrl(fetchMock.mock.calls[0][0] as string);
            expect(u.searchParams.get('q')).toBe('garr');
            expect(u.searchParams.get('offset')).toBe('0');
        });
    });
});
