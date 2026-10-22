/**
 * Test de public/sw.js : le script est évalué avec un `self` factice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

type Listener = (event: Record<string, unknown>) => void;

const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
const ORIGIN = 'https://martine.example';

interface FakeClient {
    url: string;
    focus: ReturnType<typeof vi.fn>;
    navigate?: ReturnType<typeof vi.fn>;
}

function setup(clients: FakeClient[] = []) {
    const listeners: Record<string, Listener> = {};
    const self = {
        location: { origin: ORIGIN },
        skipWaiting: vi.fn(),
        registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
        clients: {
            claim: vi.fn(),
            matchAll: vi.fn().mockResolvedValue(clients),
            openWindow: vi.fn().mockResolvedValue(undefined),
        },
        addEventListener: (type: string, fn: Listener) => { listeners[type] = fn; },
    };
    new Function('self', source)(self);
    return { self, listeners };
}

async function click(listeners: Record<string, Listener>, url: string | undefined) {
    const waits: Promise<unknown>[] = [];
    const notification = { close: vi.fn(), data: url === undefined ? undefined : { url } };
    listeners.notificationclick({ notification, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    return notification;
}

function makeClient(url: string, navigate?: () => Promise<unknown>): FakeClient {
    return { url, focus: vi.fn().mockResolvedValue(undefined), navigate: navigate ? vi.fn(navigate) : undefined };
}

describe('public/sw.js', () => {
    beforeEach(() => vi.clearAllMocks());

    it('affiche la notification reçue (titre, corps, url)', async () => {
        const { self, listeners } = setup();
        const waits: Promise<unknown>[] = [];
        listeners.push({
            data: { json: () => ({ title: 'Titre', body: 'Corps', url: '/vehicles/VL1' }), text: () => '' },
            waitUntil: (p: Promise<unknown>) => waits.push(p),
        });
        await Promise.all(waits);
        expect(self.registration.showNotification).toHaveBeenCalledWith('Titre', expect.objectContaining({
            body: 'Corps',
            data: { url: '/vehicles/VL1' },
        }));
    });

    it('retombe sur le texte brut si le payload n\'est pas du JSON', async () => {
        const { self, listeners } = setup();
        const waits: Promise<unknown>[] = [];
        listeners.push({
            data: { json: () => { throw new Error('not json'); }, text: () => 'bonjour' },
            waitUntil: (p: Promise<unknown>) => waits.push(p),
        });
        await Promise.all(waits);
        expect(self.registration.showNotification).toHaveBeenCalledWith('Martine', expect.objectContaining({ body: 'bonjour' }));
    });

    it('au clic : retire le domaine absolu, ajoute fromPush=true et ouvre une fenêtre si aucun client', async () => {
        const { self, listeners } = setup([]);
        const notification = await click(listeners, 'https://other.example/vehicles/VL186?tab=1');
        expect(notification.close).toHaveBeenCalled();
        expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/vehicles/VL186?tab=1&fromPush=true`);
    });

    it('au clic : url absente → racine avec fromPush=true', async () => {
        const { self, listeners } = setup([]);
        await click(listeners, undefined);
        expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/?fromPush=true`);
    });

    it('au clic : focalise et navigue l\'onglet existant de la même origine', async () => {
        const client = makeClient(`${ORIGIN}/stats`, async () => undefined);
        const { self, listeners } = setup([client]);
        await click(listeners, '/vehicles/VL186');
        expect(client.focus).toHaveBeenCalled();
        expect(client.navigate).toHaveBeenCalledWith(`${ORIGIN}/vehicles/VL186?fromPush=true`);
        expect(self.clients.openWindow).not.toHaveBeenCalled();
    });

    it('au clic : ouvre une fenêtre si navigate() est refusé (client non contrôlé)', async () => {
        const client = makeClient(`${ORIGIN}/stats`, async () => { throw new TypeError('not allowed'); });
        const { self, listeners } = setup([client]);
        await click(listeners, '/vehicles/VL186');
        expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/vehicles/VL186?fromPush=true`);
    });

    it('au clic : ouvre une fenêtre si le client n\'expose pas navigate()', async () => {
        const client = makeClient(`${ORIGIN}/stats`);
        const { self, listeners } = setup([client]);
        await click(listeners, '/vehicles/VL186');
        expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/vehicles/VL186?fromPush=true`);
    });

    it('au clic : ignore les onglets d\'une autre origine', async () => {
        const client = makeClient('https://autre.example/', async () => undefined);
        const { self, listeners } = setup([client]);
        await click(listeners, '/stats');
        expect(client.focus).not.toHaveBeenCalled();
        expect(self.clients.openWindow).toHaveBeenCalled();
    });
});
