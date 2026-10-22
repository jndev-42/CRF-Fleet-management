import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sessionState = vi.hoisted(() => ({
    value: { data: { user: { id: 'u1', roles: ['CHVL'] } }, status: 'authenticated' } as {
        data: { user: { id: string; roles: string[]; impersonatedEmail?: string } } | null;
        status: string;
    },
}));
vi.mock('next-auth/react', () => ({ useSession: () => sessionState.value }));

const client = vi.hoisted(() => ({
    isPushSupported: vi.fn(),
    unregisterLegacyWorkers: vi.fn(),
    resubscribeSilently: vi.fn(),
    hasBrowserSubscription: vi.fn(),
    subscribeToPush: vi.fn(),
    unsubscribeFromPush: vi.fn(),
}));
vi.mock('@/lib/push/client', () => client);

import { PushProvider, usePush } from '@/components/PushProvider';

function Probe() {
    const { status, subscribe, unsubscribe, detachDevice } = usePush();
    return (
        <div>
            <span data-testid="status">{status}</span>
            <button onClick={() => { void subscribe(); }}>probe-subscribe</button>
            <button onClick={() => { void unsubscribe(); }}>probe-unsubscribe</button>
            <button onClick={() => { void detachDevice(); }}>probe-detach</button>
        </div>
    );
}

function setPermission(permission: NotificationPermission) {
    Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: { permission, requestPermission: vi.fn() },
    });
}

function renderProvider(vapidPublicKey = 'vapid-key') {
    return render(<PushProvider vapidPublicKey={vapidPublicKey}><Probe /></PushProvider>);
}

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    sessionState.value = { data: { user: { id: 'u1', roles: ['CHVL'] } }, status: 'authenticated' };
    client.isPushSupported.mockReturnValue(true);
    client.unregisterLegacyWorkers.mockResolvedValue(undefined);
    client.resubscribeSilently.mockResolvedValue(true);
    client.hasBrowserSubscription.mockResolvedValue(false);
    client.subscribeToPush.mockResolvedValue(true);
    client.unsubscribeFromPush.mockResolvedValue(undefined);
    setPermission('default');
});

afterEach(() => {
    Reflect.deleteProperty(window, 'Notification');
});

describe('PushProvider', () => {
    it('se réabonne silencieusement si l\'autorisation est déjà accordée', async () => {
        setPermission('granted');
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('enabled'));
        expect(client.resubscribeSilently).toHaveBeenCalledWith('vapid-key');
        expect(screen.queryByRole('region', { name: 'Notifications push' })).toBeNull();
    });

    it('ne se réabonne pas si l\'utilisateur a désactivé les notifications sur cet appareil', async () => {
        setPermission('granted');
        window.localStorage.setItem('martine.push.optOut.u1', '1');
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disabled'));
        expect(client.resubscribeSilently).not.toHaveBeenCalled();
    });

    it('affiche le bandeau d\'invitation sans demander l\'autorisation tant qu\'il n\'y a pas de geste', async () => {
        renderProvider();
        expect(await screen.findByText(/Activer les notifications/)).toBeTruthy();
        expect(client.subscribeToPush).not.toHaveBeenCalled();
        expect(client.resubscribeSilently).not.toHaveBeenCalled();
    });

    it('« Activer » demande l\'autorisation puis masque le bandeau', async () => {
        renderProvider();
        fireEvent.click(await screen.findByRole('button', { name: 'Activer' }));
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('enabled'));
        expect(client.subscribeToPush).toHaveBeenCalledWith('vapid-key');
        expect(screen.queryByRole('region', { name: 'Notifications push' })).toBeNull();
    });

    it('« Plus tard » masque le bandeau pendant 30 jours', async () => {
        const { unmount } = renderProvider();
        fireEvent.click(await screen.findByRole('button', { name: 'Plus tard' }));
        expect(screen.queryByRole('region', { name: 'Notifications push' })).toBeNull();
        const until = Number(window.localStorage.getItem('martine.push.bannerSnoozedUntil'));
        expect(until).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
        unmount();

        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disabled'));
        expect(screen.queryByRole('region', { name: 'Notifications push' })).toBeNull();
    });

    it('n\'affiche pas le bandeau si l\'autorisation est refusée', async () => {
        setPermission('denied');
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('denied'));
        expect(screen.queryByRole('region', { name: 'Notifications push' })).toBeNull();
    });

    it('n\'affiche pas le bandeau et reste unsupported si le navigateur ne gère pas le push', async () => {
        client.isPushSupported.mockReturnValue(false);
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unsupported'));
        expect(screen.queryByRole('region', { name: 'Notifications push' })).toBeNull();
    });

    it('reste unsupported sans clé VAPID', async () => {
        renderProvider('');
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unsupported'));
        expect(client.resubscribeSilently).not.toHaveBeenCalled();
    });

    it('ne fait rien pour un compte INACTIF', async () => {
        sessionState.value = { data: { user: { id: 'u1', roles: ['INACTIF'] } }, status: 'authenticated' };
        setPermission('granted');
        renderProvider();
        expect(client.resubscribeSilently).not.toHaveBeenCalled();
        expect(screen.queryByRole('region', { name: 'Notifications push' })).toBeNull();
    });

    it('unsubscribe mémorise le refus, detachDevice non', async () => {
        setPermission('granted');
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('enabled'));

        fireEvent.click(screen.getByText('probe-detach'));
        await waitFor(() => expect(client.unsubscribeFromPush).toHaveBeenCalledTimes(1));
        expect(window.localStorage.getItem('martine.push.optOut.u1')).toBeNull();

        fireEvent.click(screen.getByText('probe-unsubscribe'));
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disabled'));
        expect(client.unsubscribeFromPush).toHaveBeenCalledTimes(2);
        expect(window.localStorage.getItem('martine.push.optOut.u1')).toBe('1');
    });

    it('retire l\'ancien worker même sans autorisation accordée (permission refusée ou par défaut)', async () => {
        setPermission('denied');
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('denied'));
        expect(client.unregisterLegacyWorkers).toHaveBeenCalled();
    });

    it('retire l\'ancien worker même si l\'utilisateur a désactivé les notifications', async () => {
        setPermission('granted');
        window.localStorage.setItem('martine.push.optOut.u1', '1');
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disabled'));
        expect(client.unregisterLegacyWorkers).toHaveBeenCalled();
    });

    it('ne se réabonne pas pendant une impersonation (l\'appareil de l\'admin n\'est pas rattaché au compte imité)', async () => {
        sessionState.value = { data: { user: { id: 'u-imit', roles: ['CHVL'], impersonatedEmail: 'imite@croix-rouge.fr' } }, status: 'authenticated' };
        setPermission('granted');
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('disabled'));
        expect(client.resubscribeSilently).not.toHaveBeenCalled();
        expect(screen.queryByRole('region', { name: 'Notifications push' })).toBeNull();
    });

    it('mémorise le refus par utilisateur : un autre compte du même appareil est réabonné', async () => {
        setPermission('granted');
        window.localStorage.setItem('martine.push.optOut.u1', '1');
        sessionState.value = { data: { user: { id: 'u2', roles: ['CHVL'] } }, status: 'authenticated' };
        renderProvider();
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('enabled'));
        expect(client.resubscribeSilently).toHaveBeenCalledWith('vapid-key');
    });
});
