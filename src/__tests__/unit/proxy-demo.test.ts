import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.hoisted(() => vi.fn(() => 'auth-called'));
vi.mock('next-auth', () => ({ default: () => ({ auth: authMock }) }));
vi.mock('@/auth.config', () => ({ authConfig: {} }));

import { NextRequest } from 'next/server';
import proxy from '@/proxy';

function req(path: string, method = 'GET', demo = false) {
    return new NextRequest(`http://localhost${path}`, {
        method,
        headers: demo ? { cookie: 'crf_demo_mode=1' } : {},
    });
}
const run = (r: NextRequest) => (proxy as unknown as (r: NextRequest, c: unknown) => Response | string)(r, {});

describe('proxy — mode démo lecture seule', () => {
    beforeEach(() => authMock.mockClear());

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
