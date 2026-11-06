import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    isDemoExternalWrite,
    isDemoDbConfigured,
    isDemoDbSameAsProd,
    isDemoEligibleApi,
    isDemoExemptApi,
    isDemoWriteMethod,
    isQrPage,
    isApiPath,
    isDemoBlockedRequest,
} from '@/lib/demo/readOnly';

describe('demo readOnly', () => {
    it('isDemoWriteMethod', () => {
        expect(isDemoWriteMethod('GET')).toBe(false);
        expect(isDemoWriteMethod('head')).toBe(false);
        expect(isDemoWriteMethod('OPTIONS')).toBe(false);
        expect(isDemoWriteMethod(undefined)).toBe(false);
        for (const m of ['POST', 'PATCH', 'put', 'DELETE']) expect(isDemoWriteMethod(m)).toBe(true);
    });

    it('isDemoExemptApi', () => {
        for (const p of ['/api/auth/session', '/api/qr/abc', '/api/qr-ul/abc/x', '/api/qr-stock/t', '/api/qr-uniforms/t',
            '/api/stats/csv', '/api/stats/pdf', '/api/stats/expenses/csv', '/api/stats/expenses/pdf', '/api/bugs/report']) {
            expect(isDemoExemptApi(p), p).toBe(true);
        }
        for (const p of ['/api/trips', '/api/users/x', '/api/stats', '/api/stats/csv/extra', '/api/qrcode', '/api/vehicles/1/reservations']) {
            expect(isDemoExemptApi(p), p).toBe(false);
        }
    });

    it('isQrPage', () => {
        for (const p of ['/qr/abc', '/qr-ul/abc', '/qr-stock/abc', '/qr-uniforms/abc', '/qr']) expect(isQrPage(p), p).toBe(true);
        for (const p of ['/', '/vehicles', '/qrcode', '/aide', null, undefined]) expect(isQrPage(p), String(p)).toBe(false);
    });

    it('isApiPath', () => {
        expect(isApiPath('/api/x')).toBe(true);
        expect(isApiPath('/apix')).toBe(false);
    });

    it('isDemoExternalWrite : seules les routes à effet externe', () => {
        for (const [p, m] of [
            ['/api/drive/upload', 'POST'],
            ['/api/referentiel/upload', 'POST'],
            ['/api/referentiel/process', 'POST'],
            ['/api/vehicles/VL%20186/guide', 'POST'],
            ['/api/vehicles/x/guide', 'DELETE'],
            ['/api/vehicles/VL%20186/photo', 'POST'],
            ['/api/vehicles/x/photo', 'DELETE'],
            ['/api/vehicles/x/connection', 'PUT'],
            ['/api/vehicles/x/connection', 'DELETE'],
            ['/api/trips/t1/refresh-renault', 'POST'],
            ['/api/push/subscriptions', 'POST'],
            ['/api/push/subscriptions/', 'DELETE'],
        ]) expect(isDemoExternalWrite(p, m), `${m} ${p}`).toBe(true);
        for (const [p, m] of [
            ['/api/drive/upload', 'GET'],
            ['/api/vehicles/x/guide', 'PATCH'],
            ['/api/vehicles/x/guide', 'GET'],
            ['/api/vehicles/x/photo', 'GET'],
            ['/api/vehicles/x/photo/extra', 'POST'],
            ['/api/vehicles/x/reservations', 'POST'],
            ['/api/trips', 'POST'],
            ['/api/expenses', 'POST'],
            ['/api/vehicles/x/guide/extra', 'POST'],
        ]) expect(isDemoExternalWrite(p, m), `${m} ${p}`).toBe(false);
    });

    it('isDemoBlockedRequest — base démo configurée : routes externes seulement', () => {
        expect(isDemoBlockedRequest('/api/trips', 'POST', true)).toBe(false);
        expect(isDemoBlockedRequest('/api/drive/upload', 'POST', true)).toBe(true);
        expect(isDemoBlockedRequest('/api/drive/upload', 'GET', true)).toBe(false);
        expect(isDemoBlockedRequest('/vehicles', 'POST', true)).toBe(false);
    });

    it('isDemoBlockedRequest — base démo absente : toute écriture non exemptée', () => {
        expect(isDemoBlockedRequest('/api/trips', 'POST', false)).toBe(true);
        expect(isDemoBlockedRequest('/api/drive/upload', 'POST', false)).toBe(true);
        expect(isDemoBlockedRequest('/api/trips', 'GET', false)).toBe(false);
        expect(isDemoBlockedRequest('/api/stats/csv', 'POST', false)).toBe(false);
        expect(isDemoBlockedRequest('/vehicles', 'POST', false)).toBe(false);
    });

    describe('isDemoDbConfigured', () => {
        afterEach(() => vi.unstubAllEnvs());

        it('vrai seulement si TURSO_DEMO_DATABASE_URL est renseignée', () => {
            vi.stubEnv('TURSO_DEMO_DATABASE_URL', '');
            expect(isDemoDbConfigured()).toBe(false);
            vi.stubEnv('TURSO_DEMO_DATABASE_URL', '   ');
            expect(isDemoDbConfigured()).toBe(false);
            vi.stubEnv('TURSO_DEMO_DATABASE_URL', 'libsql://crf-demo.turso.io');
            expect(isDemoDbConfigured()).toBe(true);
        });

        it('faux (et signalé) quand l\'URL démo désigne la prod', () => {
            vi.stubEnv('TURSO_DATABASE_URL', 'libsql://crf-prod.turso.io');
            vi.stubEnv('TURSO_DEMO_DATABASE_URL', ' https://crf-prod.turso.io ');
            expect(isDemoDbSameAsProd()).toBe(true);
            expect(isDemoDbConfigured()).toBe(false);
            vi.stubEnv('TURSO_DEMO_DATABASE_URL', 'libsql://crf-demo.turso.io');
            expect(isDemoDbSameAsProd()).toBe(false);
        });
    });

    it('isDemoEligibleApi : jamais les API QR publiques ni l\'authentification', () => {
        for (const p of ['/api/vehicles', '/api/trips/1', '/api/qrcode', '/api/authz']) expect(isDemoEligibleApi(p), p).toBe(true);
        for (const p of ['/api/qr/t', '/api/qr', '/api/qr-ul/t/x', '/api/qr-stock/t', '/api/qr-uniforms/t', '/api/auth/session', '/vehicles']) {
            expect(isDemoEligibleApi(p), p).toBe(false);
        }
    });
});
