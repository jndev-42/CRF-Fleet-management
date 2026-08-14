/**
 * Tests d'intégration — src/lib/renault.ts (getRenaultVehicleData).
 * DB réelle pour le cache de session (RenaultSession), fetch mocké (API Gigya/Kamereon externe).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

import { getRenaultVehicleData } from '@/lib/renault';
import { db } from './setup';

const VIN = 'VF1AB123456789012';

function jsonResponse(body: unknown, ok = true) {
    return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

describe('getRenaultVehicleData', () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;
    const mockFetch = vi.fn();

    beforeEach(() => {
        mockFetch.mockReset();
        global.fetch = mockFetch as unknown as typeof fetch;
        process.env.RENAULT_MAIL = 'test@croix-rouge.fr';
        process.env.RENAULT_PASS = 'secret';
        process.env.GIGYA_API_KEY = 'gigya-key';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        global.fetch = originalFetch;
    });

    function mockFullAuthFlow() {
        mockFetch.mockImplementation((url: string | URL) => {
            const u = url.toString();
            if (u.includes('accounts.login')) {
                return jsonResponse({ errorCode: 0, sessionInfo: { cookieValue: 'login-token' } });
            }
            if (u.includes('accounts.getAccountInfo')) {
                return jsonResponse({ data: { personId: 'person-1' } });
            }
            if (u.includes('accounts.getJWT')) {
                return jsonResponse({ id_token: 'jwt-token' });
            }
            if (u.includes('/persons/')) {
                return jsonResponse({ accounts: [{ accountType: 'MYRENAULT', accountId: 'account-1' }] });
            }
            if (u.includes('/cockpit')) {
                return jsonResponse({ data: { attributes: { totalMileage: 5000, fuelQuantity: 30, fuelAutonomy: 400, timestamp: '2026-01-01T00:00:00.000Z' } } });
            }
            if (u.includes('battery-status')) {
                return jsonResponse({ data: { attributes: {} } });
            }
            return jsonResponse({});
        });
    }

    it('s\'authentifie et récupère les données cockpit (happy path, véhicule thermique)', async () => {
        mockFullAuthFlow();
        const data = await getRenaultVehicleData(VIN);

        expect(data.totalMileage).toBe(5000);
        expect(data.fuelQuantity).toBe(30);
        expect(data.isElectric).toBe(false);
        expect(mockFetch).toHaveBeenCalled();
    });

    it('met en cache la session Renault en base pour un usage futur', async () => {
        mockFullAuthFlow();
        await getRenaultVehicleData(VIN);

        const session = await db.execute({ sql: `SELECT idToken, accountId FROM RenaultSession WHERE id = 1`, args: [] });
        expect(session.rows).toHaveLength(1);
        expect(session.rows[0].idToken).toBe('jwt-token');
    });

    it('réutilise une session en cache non expirée sans relancer l\'authentification Gigya', async () => {
        await db.execute({
            sql: `INSERT INTO RenaultSession (id, idToken, accountId, expiresAt) VALUES (1, ?, ?, ?)`,
            args: ['cached-token', 'cached-account', Date.now() + 10 * 60_000],
        });

        mockFetch.mockImplementation((url: string | URL) => {
            const u = url.toString();
            if (u.includes('accounts.login')) throw new Error('Ne devrait pas être appelé — session en cache');
            if (u.includes('/cockpit')) {
                return jsonResponse({ data: { attributes: { totalMileage: 100 } } });
            }
            if (u.includes('battery-status')) {
                return jsonResponse({ data: { attributes: {} } });
            }
            return jsonResponse({});
        });

        const data = await getRenaultVehicleData(VIN);
        expect(data.totalMileage).toBe(100);
    });

    it('détecte un véhicule électrique via les données batterie', async () => {
        mockFetch.mockImplementation((url: string | URL) => {
            const u = url.toString();
            if (u.includes('accounts.login')) return jsonResponse({ errorCode: 0, sessionInfo: { cookieValue: 'login-token' } });
            if (u.includes('accounts.getAccountInfo')) return jsonResponse({ data: { personId: 'person-1' } });
            if (u.includes('accounts.getJWT')) return jsonResponse({ id_token: 'jwt-token' });
            if (u.includes('/persons/')) return jsonResponse({ accounts: [{ accountType: 'MYRENAULT', accountId: 'account-1' }] });
            if (u.includes('/cockpit')) return jsonResponse({ data: { attributes: { totalMileage: 2000 } } });
            if (u.includes('battery-status')) {
                return jsonResponse({ data: { attributes: { batteryLevel: 85, batteryAutonomy: 250, chargingStatus: 1, plugStatus: 1, timestamp: '2026-01-01T00:00:00.000Z' } } });
            }
            return jsonResponse({});
        });

        const data = await getRenaultVehicleData(VIN);
        expect(data.isElectric).toBe(true);
        expect(data.batteryLevel).toBe(85);
    });

    it('dégrade sans lever d\'exception si l\'appel cockpit échoue', async () => {
        mockFetch.mockImplementation((url: string | URL) => {
            const u = url.toString();
            if (u.includes('accounts.login')) return jsonResponse({ errorCode: 0, sessionInfo: { cookieValue: 'login-token' } });
            if (u.includes('accounts.getAccountInfo')) return jsonResponse({ data: { personId: 'person-1' } });
            if (u.includes('accounts.getJWT')) return jsonResponse({ id_token: 'jwt-token' });
            if (u.includes('/persons/')) return jsonResponse({ accounts: [{ accountType: 'MYRENAULT', accountId: 'account-1' }] });
            if (u.includes('/cockpit')) return Promise.reject(new Error('Network error'));
            if (u.includes('battery-status')) return jsonResponse({ data: { attributes: {} } });
            return jsonResponse({});
        });

        const data = await getRenaultVehicleData(VIN);
        expect(data.totalMileage).toBeNull();
        expect(data.vin).toBe(VIN);
    });

    it('rejette si les identifiants Renault ne sont pas configurés', async () => {
        delete process.env.RENAULT_MAIL;
        await expect(getRenaultVehicleData(VIN)).rejects.toThrow('RENAULT_MAIL, RENAULT_PASS and GIGYA_API_KEY must be set');
    });
});
