import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    hasBrowserSubscription,
    isPushSupported,
    resubscribeSilently,
    subscribeToPush,
    unregisterLegacyWorkers,
    unsubscribeFromPush,
    urlBase64ToUint8Array,
} from '@/lib/push/client';

const VAPID_KEY = 'AQID'; // octets [1, 2, 3]

type FakeSubscription = ReturnType<typeof makeSubscription>;

function makeSubscription(endpoint = 'https://fcm.googleapis.com/fcm/send/abc', key: number[] | null = [1, 2, 3]) {
    return {
        endpoint,
        options: { applicationServerKey: key ? new Uint8Array(key).buffer : null },
        toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
        unsubscribe: vi.fn().mockResolvedValue(true),
    };
}

function makeRegistration(scriptPath: string, existing: FakeSubscription | null = null) {
    const created = makeSubscription();
    return {
        active: { scriptURL: `http://localhost${scriptPath}` },
        unregister: vi.fn().mockResolvedValue(true),
        created,
        pushManager: {
            getSubscription: vi.fn().mockResolvedValue(existing),
            subscribe: vi.fn().mockResolvedValue(created),
        },
    };
}

type FakeRegistration = ReturnType<typeof makeRegistration>;

let fetchMock: ReturnType<typeof vi.fn>;
let requestPermission: ReturnType<typeof vi.fn>;
let serviceWorker: {
    getRegistrations: ReturnType<typeof vi.fn>;
    getRegistration: ReturnType<typeof vi.fn>;
    register: ReturnType<typeof vi.fn>;
    ready: Promise<FakeRegistration>;
};

function installBrowser(options: {
    permission?: NotificationPermission;
    requested?: NotificationPermission;
    registration?: FakeRegistration;
    registrations?: FakeRegistration[];
} = {}) {
    const registration = options.registration ?? makeRegistration('/sw.js');
    requestPermission = vi.fn().mockResolvedValue(options.requested ?? 'granted');
    Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: { permission: options.permission ?? 'granted', requestPermission },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    serviceWorker = {
        getRegistrations: vi.fn().mockResolvedValue(options.registrations ?? []),
        getRegistration: vi.fn().mockResolvedValue(registration),
        register: vi.fn().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
    return registration;
}

beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'Notification');
    Reflect.deleteProperty(window, 'PushManager');
    Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('urlBase64ToUint8Array', () => {
    it('décode une clé base64url (alphabet - et _, sans padding)', () => {
        // 0xfb 0xff 0xfe → "+//+" en base64 standard, "-__-" en base64url
        expect(Array.from(urlBase64ToUint8Array('-__-'))).toEqual([0xfb, 0xff, 0xfe]);
    });

    it('rajoute le padding manquant', () => {
        expect(Array.from(urlBase64ToUint8Array('aGk'))).toEqual([104, 105]); // "hi"
    });
});

describe('isPushSupported', () => {
    it('retourne false dans un environnement sans Push API (jsdom)', () => {
        expect(isPushSupported()).toBe(false);
    });

    it('retourne true quand serviceWorker, PushManager et Notification existent', () => {
        installBrowser();
        expect(isPushSupported()).toBe(true);
    });
});

describe('unregisterLegacyWorkers', () => {
    it('ne fait rien si le push n\'est pas supporté', async () => {
        await expect(unregisterLegacyWorkers()).resolves.toBeUndefined();
    });

    it('désenregistre tout worker autre que /sw.js et conserve le nôtre', async () => {
        const legacy = makeRegistration('/legacy-worker.js');
        const ours = makeRegistration('/sw.js');
        installBrowser({ registrations: [legacy, ours] });

        await unregisterLegacyWorkers();

        expect(legacy.unregister).toHaveBeenCalledTimes(1);
        expect(ours.unregister).not.toHaveBeenCalled();
    });

    it('n\'échoue pas si getRegistrations échoue', async () => {
        installBrowser();
        serviceWorker.getRegistrations.mockRejectedValue(new Error('boom'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(unregisterLegacyWorkers()).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalled();
    });
});

describe('subscribeToPush', () => {
    it('retourne false si le push n\'est pas supporté', async () => {
        expect(await subscribeToPush(VAPID_KEY)).toBe(false);
    });

    it('demande l\'autorisation quand elle est « default » puis abonne et enregistre côté serveur', async () => {
        const registration = installBrowser({ permission: 'default', requested: 'granted' });

        expect(await subscribeToPush(VAPID_KEY)).toBe(true);

        expect(requestPermission).toHaveBeenCalledTimes(1);
        expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js');
        expect(registration.pushManager.subscribe).toHaveBeenCalledWith({
            userVisibleOnly: true,
            applicationServerKey: new Uint8Array([1, 2, 3]),
        });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/push/subscriptions');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({
            endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
            keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
        });
    });

    it('retourne false sans abonner si l\'utilisateur refuse l\'invite', async () => {
        const registration = installBrowser({ permission: 'default', requested: 'denied' });

        expect(await subscribeToPush(VAPID_KEY)).toBe(false);

        expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('retourne false sans inviter si l\'autorisation est déjà refusée', async () => {
        installBrowser({ permission: 'denied' });
        expect(await subscribeToPush(VAPID_KEY)).toBe(false);
        expect(requestPermission).not.toHaveBeenCalled();
    });

    it('réutilise l\'abonnement existant quand la clé VAPID est identique', async () => {
        const existing = makeSubscription();
        const registration = installBrowser({ registration: makeRegistration('/sw.js', existing) });

        expect(await subscribeToPush(VAPID_KEY)).toBe(true);

        expect(existing.unsubscribe).not.toHaveBeenCalled();
        expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('se réabonne quand la clé VAPID a changé (ancien abonnement supprimé)', async () => {
        const stale = makeSubscription('https://fcm.googleapis.com/fcm/send/old', [9, 9, 9]);
        const registration = installBrowser({ registration: makeRegistration('/sw.js', stale) });

        expect(await subscribeToPush(VAPID_KEY)).toBe(true);

        expect(stale.unsubscribe).toHaveBeenCalledTimes(1);
        expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1);
    });

    it('désenregistre les anciens workers avant de s\'abonner', async () => {
        const legacy = makeRegistration('/legacy-worker.js');
        installBrowser({ registrations: [legacy] });
        await subscribeToPush(VAPID_KEY);
        expect(legacy.unregister).toHaveBeenCalled();
    });

    it('lève une erreur si le serveur refuse l\'abonnement', async () => {
        installBrowser();
        fetchMock.mockResolvedValue({ ok: false, status: 500 });
        await expect(subscribeToPush(VAPID_KEY)).rejects.toThrow(/500/);
    });
});

describe('resubscribeSilently', () => {
    it('retourne false sans rien faire si le push n\'est pas supporté', async () => {
        expect(await resubscribeSilently(VAPID_KEY)).toBe(false);
    });

    it.each(['default', 'denied'] as const)('ne s\'abonne ni n\'invite jamais quand l\'autorisation est « %s »', async (permission) => {
        const registration = installBrowser({ permission });

        expect(await resubscribeSilently(VAPID_KEY)).toBe(false);

        expect(requestPermission).not.toHaveBeenCalled();
        expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('abonne et enregistre quand l\'autorisation est accordée', async () => {
        const registration = installBrowser({ permission: 'granted' });

        expect(await resubscribeSilently(VAPID_KEY)).toBe(true);

        expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('/api/push/subscriptions', expect.objectContaining({ method: 'POST' }));
    });
});

describe('hasBrowserSubscription', () => {
    it('retourne false si le push n\'est pas supporté', async () => {
        expect(await hasBrowserSubscription()).toBe(false);
    });

    it('retourne false sans enregistrement du worker', async () => {
        installBrowser();
        serviceWorker.getRegistration.mockResolvedValue(undefined);
        expect(await hasBrowserSubscription()).toBe(false);
    });

    it('retourne true quand un abonnement existe, false sinon', async () => {
        installBrowser({ registration: makeRegistration('/sw.js', makeSubscription()) });
        expect(await hasBrowserSubscription()).toBe(true);

        installBrowser({ registration: makeRegistration('/sw.js', null) });
        expect(await hasBrowserSubscription()).toBe(false);
    });

    it('retourne false si la lecture échoue', async () => {
        installBrowser();
        serviceWorker.getRegistration.mockRejectedValue(new Error('boom'));
        expect(await hasBrowserSubscription()).toBe(false);
    });
});

describe('unsubscribeFromPush', () => {
    it('ne fait rien sans abonnement', async () => {
        installBrowser({ registration: makeRegistration('/sw.js', null) });
        await unsubscribeFromPush();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('envoie le DELETE au serveur puis désabonne le navigateur', async () => {
        const existing = makeSubscription();
        const order: string[] = [];
        fetchMock.mockImplementation(async () => { order.push('delete'); return { ok: true, status: 200 }; });
        existing.unsubscribe.mockImplementation(async () => { order.push('browser'); return true; });
        installBrowser({ registration: makeRegistration('/sw.js', existing) });

        await unsubscribeFromPush();

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/push/subscriptions');
        expect(init.method).toBe('DELETE');
        expect(JSON.parse(init.body)).toEqual({ endpoint: existing.endpoint });
        expect(order).toEqual(['delete', 'browser']);
    });

    it('désabonne quand même le navigateur si le DELETE réseau échoue', async () => {
        const existing = makeSubscription();
        fetchMock.mockRejectedValue(new Error('offline'));
        installBrowser({ registration: makeRegistration('/sw.js', existing) });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await unsubscribeFromPush();

        expect(errorSpy).toHaveBeenCalled();
        expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
    });
});
