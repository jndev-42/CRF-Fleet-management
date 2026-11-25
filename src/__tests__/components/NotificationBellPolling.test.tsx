import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ctx = vi.hoisted(() => ({
    ulId: 'ul-paris-18',
    email: 'user@test.com' as string | null,
    search: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => ctx.search,
}));
vi.mock('@/lib/contexts/ULContext', () => ({
    useUL: () => ({ activeUL: { id: ctx.ulId, name: ctx.ulId } }),
}));
vi.mock('next-auth/react', () => ({
    useSession: () => ({ data: ctx.email ? { user: { email: ctx.email } } : null, status: ctx.email ? 'authenticated' : 'unauthenticated' }),
}));

import { NotificationBell } from '@/components/NotificationBell';

const MINUTE = 60_000;
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

/** Appels `GET /api/notifications` (les suppressions ne comptent pas). */
const loads = () => fetchMock.mock.calls.filter(([url, init]) => url === '/api/notifications' && !init?.method);
const deletions = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url);

const reply = (...notifications: Array<{ id: string; title?: string; url?: string }>) =>
    new Response(JSON.stringify({
        notifications: notifications.map(n => ({ title: n.id, message: '', isRead: false, createdAt: '2026-01-01T00:00:00.000Z', ...n })),
    }), { status: 200 });

function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const hideTab = () => act(async () => {
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(0);
});
/** Les deux événements que le navigateur déclenche au retour sur l'onglet. */
const showTab = () => act(async () => {
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
});

beforeEach(() => {
    vi.useFakeTimers();
    ctx.ulId = 'ul-paris-18';
    ctx.email = 'user@test.com';
    ctx.search = new URLSearchParams();
    setVisibility('visible');
    fetchMock.mockReset().mockImplementation(async () => reply());
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'visibilityState');
    window.history.pushState({}, '', '/');
});

async function mountBell() {
    const view = render(<NotificationBell />);
    await advance(0);
    return view;
}

describe('NotificationBell — interrogation du serveur', () => {
    it('onglet visible : un appel au montage, puis un toutes les 5 min', async () => {
        await mountBell();
        expect(loads()).toHaveLength(1);
        await advance(5 * MINUTE - 1);
        expect(loads()).toHaveLength(1);
        await advance(1);
        expect(loads()).toHaveLength(2);
        await advance(55 * MINUTE);
        expect(loads()).toHaveLength(13);
    });

    it('onglet caché : aucun appel', async () => {
        await mountBell();
        await hideTab();
        await advance(3 * 60 * MINUTE);
        expect(loads()).toHaveLength(1);
    });

    it('onglet ouvert en arrière-plan : aucun appel avant d\'être affiché', async () => {
        setVisibility('hidden');
        await mountBell();
        await advance(60 * MINUTE);
        expect(loads()).toHaveLength(0);
        await showTab();
        expect(loads()).toHaveLength(1);
    });

    it('requête en cours quand l\'onglet se cache : rien n\'est reprogrammé', async () => {
        let resolve!: (r: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
        await mountBell();
        await hideTab();
        await act(async () => { resolve(reply()); await vi.advanceTimersByTimeAsync(0); });
        await advance(60 * MINUTE);
        expect(loads()).toHaveLength(1);
    });

    it('retour sur l\'onglet (visibilitychange + focus) : un seul appel, puis la boucle reprend', async () => {
        await mountBell();
        await hideTab();
        await advance(2 * MINUTE);
        await showTab();
        expect(loads()).toHaveLength(2);
        await advance(5 * MINUTE - 1);
        expect(loads()).toHaveLength(2);
        await advance(1);
        expect(loads()).toHaveLength(3);
    });

    it('retour sur l\'onglet : aucun appel si le dernier date de moins de 60 s', async () => {
        await mountBell();
        await hideTab();
        await advance(MINUTE - 1);
        await showTab();
        expect(loads()).toHaveLength(1);
        // La boucle repart sur l'échéance d'origine (5 min après le dernier chargement)
        await advance(4 * MINUTE);
        expect(loads()).toHaveLength(1);
        await advance(1);
        expect(loads()).toHaveLength(2);
    });

    it('allers-retours répétés : jamais plus d\'un appel par minute, une seule boucle', async () => {
        await mountBell();
        for (let i = 0; i < 12; i++) {
            await hideTab();
            await advance(5_000);
            await showTab();
            await advance(5_000);
        }
        // 1 au montage (0 s), 1 au premier retour après 60 s (65 s) ; le suivant serait à 125 s
        expect(loads()).toHaveLength(2);
        await advance(5 * MINUTE);
        expect(loads()).toHaveLength(3);
    });

    it('une seule requête en vol à la fois', async () => {
        let resolve!: (r: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
        await mountBell();
        await hideTab();
        await showTab();
        await hideTab();
        await showTab();
        expect(loads()).toHaveLength(1);
        await act(async () => { resolve(reply({ id: 'n1' })); await vi.advanceTimersByTimeAsync(0); });
        expect(loads()).toHaveLength(1);
    });

    it('une requête restée sans réponse est abandonnée après 30 s et la boucle continue', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockImplementationOnce((_url, init) => new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }));
        await mountBell();
        const signal = loads()[0][1]?.signal;
        await advance(29_999);
        expect(signal?.aborted).toBe(false);
        await advance(1);
        expect(signal?.aborted).toBe(true);
        expect(loads()).toHaveLength(1);
        await advance(5 * MINUTE);
        expect(loads()).toHaveLength(2);
    });

    it('échec réseau : la liste affichée est conservée, le retour sur l\'onglet retente tout de suite', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockImplementationOnce(async () => reply({ id: 'n1' }));
        const { container } = await mountBell();
        fetchMock.mockImplementationOnce(async () => { throw new TypeError('Failed to fetch'); });
        await hideTab();
        await advance(2 * MINUTE);
        await showTab();
        expect(loads()).toHaveLength(2);
        expect(container.querySelector('.notification-badge')).toBeTruthy();
        await hideTab();
        await showTab();
        expect(loads()).toHaveLength(3);
    });

    it('après démontage : plus aucun appel, requête en cours abandonnée, écouteurs retirés', async () => {
        fetchMock.mockImplementationOnce(() => new Promise(() => {}));
        const { unmount } = await mountBell();
        const signal = loads()[0][1]?.signal;
        unmount();
        expect(signal?.aborted).toBe(true);
        await advance(60 * MINUTE);
        await hideTab();
        await advance(10 * MINUTE);
        await showTab();
        expect(loads()).toHaveLength(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('changement d\'UL : rechargement immédiat, réponse de l\'ancienne UL ignorée', async () => {
        let resolveOld!: (r: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise(r => { resolveOld = r; }));
        const { rerender, container } = await mountBell();

        ctx.ulId = 'ul-lyon-3';
        rerender(<NotificationBell />);
        await advance(0);
        expect(loads()).toHaveLength(2);
        expect(loads()[0][1]?.signal?.aborted).toBe(true);

        await act(async () => { resolveOld(reply({ id: 'ancienne-ul' })); await vi.advanceTimersByTimeAsync(0); });
        expect(container.querySelector('.notification-badge')).toBeNull();
        // Une seule boucle subsiste
        await advance(5 * MINUTE);
        expect(loads()).toHaveLength(3);
    });

    it('changement de personne à UL égale (impersonation) : liste précédente masquée et rechargée', async () => {
        fetchMock.mockImplementationOnce(async () => reply({ id: 'n1' }));
        const { rerender, container } = await mountBell();
        expect(container.querySelector('.notification-badge')).toBeTruthy();

        fetchMock.mockImplementationOnce(() => new Promise(() => {}));
        ctx.email = 'autre@test.com';
        rerender(<NotificationBell />);
        await advance(0);
        expect(container.querySelector('.notification-badge')).toBeNull();
        expect(loads()).toHaveLength(2);
    });

    it('changement d\'UL onglet caché : rechargé au retour, même à moins de 60 s', async () => {
        const { rerender } = await mountBell();
        await hideTab();
        ctx.ulId = 'ul-lyon-3';
        rerender(<NotificationBell />);
        await advance(1_000);
        expect(loads()).toHaveLength(1);
        await showTab();
        expect(loads()).toHaveLength(2);
    });

    it('session momentanément perdue puis retrouvée : liste gardée, aucun appel en plus', async () => {
        fetchMock.mockImplementationOnce(async () => reply({ id: 'n1' }));
        const { rerender, container } = await mountBell();
        for (const email of [null, 'user@test.com']) {
            ctx.email = email;
            rerender(<NotificationBell />);
            await advance(0);
            expect(container.querySelector('.notification-badge')).toBeTruthy();
        }
        expect(loads()).toHaveLength(1);
    });

    it('suppression pendant une requête : la réponse périmée ne fait pas réapparaître l\'élément', async () => {
        fetchMock.mockImplementationOnce(async () => reply({ id: 'n1' }));
        await mountBell();
        let resolve!: (r: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
        await advance(5 * MINUTE);
        expect(loads()).toHaveLength(2);

        act(() => screen.getByRole('button', { name: 'Notifications' }).click());
        await act(async () => { screen.getByTitle('Tout effacer').click(); await vi.advanceTimersByTimeAsync(0); });
        await act(async () => { resolve(reply({ id: 'n1' })); await vi.advanceTimersByTimeAsync(0); });
        expect(screen.queryByText('n1')).toBeNull();
        expect(loads()).toHaveLength(3);
        await advance(5 * MINUTE - 1);
        expect(loads()).toHaveLength(3);
    });

    it('« Effacer » terminé après un changement d\'UL : la liste de la nouvelle UL reste affichée', async () => {
        fetchMock.mockImplementationOnce(async () => reply({ id: 'n1' }));
        const { rerender } = await mountBell();
        let resolveDelete!: (r: Response) => void;
        fetchMock.mockImplementationOnce(() => new Promise(r => { resolveDelete = r; }));
        act(() => screen.getByRole('button', { name: 'Notifications' }).click());
        act(() => screen.getByTitle('Tout effacer').click());

        fetchMock.mockImplementationOnce(async () => reply({ id: 'n2' }));
        ctx.ulId = 'ul-lyon-3';
        rerender(<NotificationBell />);
        await advance(0);
        await act(async () => { resolveDelete(new Response('{}')); await vi.advanceTimersByTimeAsync(0); });
        expect(screen.getByText('n2')).toBeTruthy();
    });

    it('arrivée depuis un push : un seul chargement, notifications de la page supprimées', async () => {
        ctx.search = new URLSearchParams('fromPush=true');
        window.history.pushState({}, '', '/vehicles/VL186?fromPush=true');
        fetchMock.mockImplementationOnce(async () => reply(
            { id: 'ici', url: '/vehicles/VL186' },
            { id: 'ailleurs', url: '/expenses' },
        ));
        await mountBell();
        expect(loads()).toHaveLength(1);
        expect(deletions()).toEqual(['/api/notifications/ici']);
        expect(window.location.search).toBe('');
        act(() => screen.getByRole('button', { name: 'Notifications' }).click());
        expect(screen.queryByText('ici')).toBeNull();
        expect(screen.getByText('ailleurs')).toBeTruthy();
    });
});
