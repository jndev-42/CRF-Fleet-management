import { describe, it, expect } from 'vitest';
import {
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

    it('isDemoBlockedRequest', () => {
        expect(isDemoBlockedRequest('/api/trips', 'POST')).toBe(true);
        expect(isDemoBlockedRequest('/api/trips', 'GET')).toBe(false);
        expect(isDemoBlockedRequest('/api/stats/csv', 'POST')).toBe(false);
        expect(isDemoBlockedRequest('/vehicles', 'POST')).toBe(false);
    });
});
