import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMock = vi.hoisted(() => vi.fn(() => 'auth-called'));
vi.mock('next-auth', () => ({ default: () => ({ auth: authMock }) }));
vi.mock('@/auth.config', () => ({ authConfig: {} }));

import { NextRequest } from 'next/server';
import proxy from '@/proxy';

function req(path: string, method = 'GET', demo = false, extra: Record<string, string> = {}) {
    return new NextRequest(`http://localhost${path}`, {
        method,
        headers: { ...(demo ? { cookie: 'crf_demo_mode=1' } : {}), ...extra },
    });
}
/** En-tête de requête transmis à la route par `NextResponse.next({ request: { headers } })`. */
const forwardedDemoHeader = (res: Response) => res.headers.get('x-middleware-request-x-crf-demo');
const run = (r: NextRequest) => (proxy as unknown as (r: NextRequest, c: unknown) => Response | string)(r, {});

describe('proxy — base démo non configurée (garde-fou : lecture seule)', () => {
    beforeEach(() => {
        authMock.mockClear();
        vi.stubEnv('TURSO_DEMO_DATABASE_URL', '');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('403 sur une écriture API avec le cookie démo', async () => {
        const res = run(req('/api/users/x', 'PATCH', true)) as Response;
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'Mode démo : lecture seule', demo: true });
    });

    it('laisse passer une écriture API sans cookie', () => {
        const res = run(req('/api/users/x', 'PATCH')) as Response;
        expect(res.status).toBe(200);
        expect(authMock).not.toHaveBeenCalled();
    });

    it('laisse passer les GET avec le cookie', () => {
        expect((run(req('/api/expenses', 'GET', true)) as Response).status).toBe(200);
    });

    it.each(['/api/auth/signout', '/api/qr/t/x', '/api/qr-ul/t', '/api/qr-stock/t', '/api/qr-uniforms/t',
        '/api/stats/csv', '/api/stats/expenses/pdf', '/api/bugs/report'])('exempte %s', (p) => {
        expect((run(req(p, 'POST', true)) as Response).status).toBe(200);
    });

    it('délègue les pages à NextAuth', () => {
        expect(run(req('/vehicles', 'GET', true))).toBe('auth-called');
        expect(authMock).toHaveBeenCalled();
    });
});

describe('proxy — base démo configurée', () => {
    beforeEach(() => vi.stubEnv('TURSO_DEMO_DATABASE_URL', 'libsql://crf-demo.turso.io'));
    afterEach(() => vi.unstubAllEnvs());

    it.each([
        ['/api/vehicles/x/reservations', 'POST'],
        ['/api/users/x', 'PATCH'],
        ['/api/trips/t1', 'DELETE'],
        ['/api/expenses/upload', 'POST'], // justificatifs : R2 sous demo/
    ])('laisse passer %s (%s) vers la base démo', (p, m) => {
        expect((run(req(p, m, true)) as Response).status).toBe(200);
    });

    it.each([
        ['/api/drive/upload', 'POST'],
        ['/api/referentiel/upload', 'POST'],
        ['/api/referentiel/process', 'POST'],
        ['/api/vehicles/x/guide', 'POST'],
        ['/api/vehicles/x/guide', 'DELETE'],
        ['/api/vehicles/x/connection', 'PUT'],
        ['/api/trips/t1/refresh-renault', 'POST'],
        ['/api/push/subscriptions', 'POST'],
    ])('403 sur la route externe %s (%s)', async (p, m) => {
        const res = run(req(p, m, true)) as Response;
        expect(res.status).toBe(403);
        expect((await res.json()).demo).toBe(true);
    });

    it('laisse passer une route externe sans cookie', () => {
        expect((run(req('/api/drive/upload', 'POST')) as Response).status).toBe(200);
    });
});

describe('proxy — en-tête x-crf-demo (seule source de la démo côté serveur)', () => {
    beforeEach(() => vi.stubEnv('TURSO_DEMO_DATABASE_URL', 'libsql://crf-demo.turso.io'));
    afterEach(() => vi.unstubAllEnvs());

    it('pose x-crf-demo: 1 sur une API avec le cookie de démo', () => {
        const res = run(req('/api/vehicles', 'GET', true)) as Response;
        expect(forwardedDemoHeader(res)).toBe('1');
        expect(forwardedDemoHeader(run(req('/api/trips', 'POST', true)) as Response)).toBe('1');
    });

    it('ne pose rien sans cookie', () => {
        expect(forwardedDemoHeader(run(req('/api/vehicles')) as Response)).toBeNull();
    });

    it('retire un x-crf-demo envoyé par le client', () => {
        const res = run(req('/api/vehicles', 'POST', false, { 'x-crf-demo': '1' })) as Response;
        expect(res.status).toBe(200);
        expect(forwardedDemoHeader(res)).toBeNull();
        expect(res.headers.get('x-middleware-override-headers')).not.toContain('x-crf-demo');
    });

    it.each(['/api/qr/t/checkout', '/api/qr-ul/t', '/api/qr-stock/t/adjust', '/api/qr-uniforms/t', '/api/auth/session'])(
        "pas de démo pour %s même avec le cookie (et l'en-tête client est retiré)",
        (p) => {
            const res = run(req(p, 'GET', true, { 'x-crf-demo': '1' })) as Response;
            expect(forwardedDemoHeader(res)).toBeNull();
        },
    );
});
