import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { setupFetchInterceptor } from '@/lib/demo/fetchInterceptor';
import { IS_DEMO_MODE_KEY, DEMO_SIMULATED_EVENT } from '@/lib/demo/readOnly';

const realFetch = vi.fn(async () => new Response('real', { status: 200 }));

describe('fetchInterceptor (démo : base partagée, routes externes simulées)', () => {
    beforeAll(() => {
        window.fetch = realFetch as unknown as typeof window.fetch;
        setupFetchInterceptor();
    });

    beforeEach(() => {
        realFetch.mockClear();
        localStorage.clear();
        window.history.pushState({}, '', '/');
    });

    it('est idempotent', () => {
        const installed = window.fetch;
        setupFetchInterceptor();
        expect(window.fetch).toBe(installed);
    });

    it('laisse tout passer hors démo', async () => {
        await fetch('/api/trips', { method: 'POST' });
        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    it('laisse passer les GET en démo', async () => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        await fetch('/api/expenses');
        await fetch('/api/expenses', { method: 'HEAD' });
        expect(realFetch).toHaveBeenCalledTimes(2);
    });

    it('laisse passer les écritures en base vers l\'API (base démo)', async () => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        const listener = vi.fn();
        window.addEventListener(DEMO_SIMULATED_EVENT, listener);
        await fetch('/api/vehicles/x/reservations', { method: 'POST', body: '{}' });
        await fetch('/api/users/x', { method: 'PATCH' });
        window.removeEventListener(DEMO_SIMULATED_EVENT, listener);
        expect(realFetch).toHaveBeenCalledTimes(2);
        expect(listener).not.toHaveBeenCalled();
    });

    it('simule une écriture externe, sans réseau, et émet l\'événement', async () => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        const listener = vi.fn();
        window.addEventListener(DEMO_SIMULATED_EVENT, listener);
        const res = await fetch('/api/referentiel/upload', { method: 'POST', body: '{}' });
        window.removeEventListener(DEMO_SIMULATED_EVENT, listener);
        expect(realFetch).not.toHaveBeenCalled();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, simulated: true });
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('simule aussi les URL absolues et les Request', async () => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        await fetch('http://localhost/api/vehicles/x/connection', { method: 'PUT' });
        await fetch(new Request('http://localhost/api/vehicles/x/documents/d1', { method: 'DELETE' }));
        expect(realFetch).not.toHaveBeenCalled();
    });

    it('simule /api/push/subscriptions sans émettre la notice', async () => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        const listener = vi.fn();
        window.addEventListener(DEMO_SIMULATED_EVENT, listener);
        const res = await fetch('/api/push/subscriptions', { method: 'POST', body: '{}' });
        window.removeEventListener(DEMO_SIMULATED_EVENT, listener);
        expect(realFetch).not.toHaveBeenCalled();
        expect(await res.json()).toEqual({ success: true, simulated: true });
        expect(listener).not.toHaveBeenCalled();
    });

    it.each([
        '/api/auth/signout',
        '/api/qr/t/checkout',
        '/api/stats/csv',
        '/api/stats/expenses/pdf',
        '/api/bugs/report',
    ])('laisse passer l\'exemption %s', async (path) => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        await fetch(path, { method: 'POST' });
        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    it('ne simule rien sur une page QR', async () => {
        localStorage.setItem(IS_DEMO_MODE_KEY, 'true');
        window.history.pushState({}, '', '/qr/abc');
        await fetch('/api/referentiel/upload', { method: 'POST' });
        expect(realFetch).toHaveBeenCalledTimes(1);
    });
});
