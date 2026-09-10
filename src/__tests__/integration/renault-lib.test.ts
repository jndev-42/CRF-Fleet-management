/**
 * Tests d'intégration — `src/lib/renault.ts` piloté par `src/lib/vehicle-connection.ts`.
 *
 * DB réelle pour le cache de session (`RenaultSession`, désormais clefé par
 * `credentialId`) et pour la résolution du contexte de connexion ; `fetch`
 * mocké (API Gigya/Kamereon externe).
 *
 * ⚠️ Ce fichier atteste aussi que la lib ne lit **plus aucun identifiant dans
 * l'environnement** : `RENAULT_MAIL` et `RENAULT_PASS` sont explicitement
 * supprimés avant chaque cas, y compris le happy path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

// Clé de test — `@/lib/crypto` lit l'environnement à chaque appel, jamais au
// chargement du module : la poser ici suffit.
process.env.CREDENTIALS_ENCRYPTION_KEY = 'b'.repeat(64);

import { __clearSessionCache, BrandAuthError, BrandTransientError, VinNotOnAccountError } from '@/lib/renault';
import { getRenaultVehicleData, VehicleNotConnectedError } from '@/lib/vehicle-connection';
import { encryptSecret } from '@/lib/crypto';
import { db, seedVehicle } from './setup';

const VIN = 'VF1AB123456789012';
const VEHICLE_ID = 'veh-1';
const CREDENTIAL_ID = 'cred-1';

function jsonResponse(body: unknown, ok = true, status = 200) {
    return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

async function seedCredential(id: string, ulId = 'ul-paris-18') {
    await db.execute({
        sql: `INSERT INTO BrandCredential (id, ulId, brand, login, passwordEncrypted) VALUES (?,?,?,?,?)`,
        args: [id, ulId, 'RENAULT', `${id}@croix-rouge.fr`, encryptSecret('mot-de-passe-de-test')],
    });
}

async function seedConnection(vehicleId: string, credentialId: string, vin = VIN) {
    await seedVehicle({ id: vehicleId, name: vehicleId.toUpperCase(), vin });
    await db.execute({
        sql: `INSERT INTO VehicleConnection (id, vehicleId, credentialId, brand, vin, status)
              VALUES (?,?,?,?,?,'CONNECTED')`,
        args: [`vc-${vehicleId}`, vehicleId, credentialId, 'RENAULT', vin],
    });
}

describe('getRenaultVehicleData — client Renault et cache de session', () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;
    const mockFetch = vi.fn();

    beforeEach(() => {
        mockFetch.mockReset();
        global.fetch = mockFetch as unknown as typeof fetch;
        __clearSessionCache();
        // Preuve, dans CHAQUE cas, que plus rien ne dépend du compte global :
        // ces variables n'existent pas pendant l'exécution des tests.
        delete process.env.RENAULT_MAIL;
        delete process.env.RENAULT_PASS;
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

    function countLogins(): number {
        return mockFetch.mock.calls.filter(c => String(c[0]).includes('accounts.login')).length;
    }

    it('s\'authentifie et récupère les données cockpit sans RENAULT_MAIL ni RENAULT_PASS (happy path, véhicule thermique)', async () => {
        await seedCredential(CREDENTIAL_ID);
        await seedConnection(VEHICLE_ID, CREDENTIAL_ID);
        mockFullAuthFlow();

        const data = await getRenaultVehicleData(VEHICLE_ID);

        expect(data.totalMileage).toBe(5000);
        expect(data.fuelQuantity).toBe(30);
        expect(data.isElectric).toBe(false);
        expect(data.vin).toBe(VIN);
        expect(countLogins()).toBe(1);
    });

    it('transmet à Gigya les identifiants portés par la BrandCredential, déchiffrés', async () => {
        await seedCredential(CREDENTIAL_ID);
        await seedConnection(VEHICLE_ID, CREDENTIAL_ID);
        mockFullAuthFlow();

        await getRenaultVehicleData(VEHICLE_ID);

        const loginCall = mockFetch.mock.calls.find(c => String(c[0]).includes('accounts.login'));
        const loginUrl = new URL(String(loginCall?.[0]));
        expect(loginUrl.searchParams.get('loginID')).toBe(`${CREDENTIAL_ID}@croix-rouge.fr`);
        expect(loginUrl.searchParams.get('password')).toBe('mot-de-passe-de-test');
    });

    it('met en cache la session Renault en base, clefée par credentialId', async () => {
        await seedCredential(CREDENTIAL_ID);
        await seedConnection(VEHICLE_ID, CREDENTIAL_ID);
        mockFullAuthFlow();

        await getRenaultVehicleData(VEHICLE_ID);

        const session = await db.execute({
            sql: `SELECT idToken, accountId FROM RenaultSession WHERE credentialId = ?`,
            args: [CREDENTIAL_ID],
        });
        expect(session.rows).toHaveLength(1);
        expect(session.rows[0].idToken).toBe('jwt-token');
        expect(session.rows[0].accountId).toBe('account-1');
    });

    it('tient une ligne de session PAR credential (deux comptes ⇒ deux lignes)', async () => {
        await seedCredential('cred-a', 'ul-paris-18');
        await seedCredential('cred-b', 'ul-lyon-3');
        await seedConnection('veh-a', 'cred-a', 'VF1AAA00000000001');
        await seedConnection('veh-b', 'cred-b', 'VF1BBB00000000002');
        mockFullAuthFlow();

        await getRenaultVehicleData('veh-a');
        await getRenaultVehicleData('veh-b');

        const rows = await db.execute(`SELECT credentialId FROM RenaultSession WHERE credentialId IS NOT NULL`);
        expect(rows.rows).toHaveLength(2);
        expect(rows.rows.map(r => r.credentialId).sort()).toEqual(['cred-a', 'cred-b']);
        expect(countLogins()).toBe(2);
    });

    it('réutilise la session en cache en base sans relancer l\'authentification Gigya', async () => {
        await seedCredential(CREDENTIAL_ID);
        await seedConnection(VEHICLE_ID, CREDENTIAL_ID);
        await db.execute({
            sql: `INSERT INTO RenaultSession (credentialId, idToken, accountId, expiresAt) VALUES (?, ?, ?, ?)`,
            args: [CREDENTIAL_ID, 'cached-token', 'cached-account', Date.now() + 10 * 60_000],
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

        const data = await getRenaultVehicleData(VEHICLE_ID);
        expect(data.totalMileage).toBe(100);
        expect(countLogins()).toBe(0);
    });

    it('ré-authentifie quand la session en cache est expirée', async () => {
        await seedCredential(CREDENTIAL_ID);
        await seedConnection(VEHICLE_ID, CREDENTIAL_ID);
        await db.execute({
            sql: `INSERT INTO RenaultSession (credentialId, idToken, accountId, expiresAt) VALUES (?, ?, ?, ?)`,
            args: [CREDENTIAL_ID, 'stale-token', 'stale-account', Date.now() - 60_000],
        });
        mockFullAuthFlow();

        await getRenaultVehicleData(VEHICLE_ID);

        expect(countLogins()).toBe(1);
        const session = await db.execute({
            sql: `SELECT idToken FROM RenaultSession WHERE credentialId = ?`,
            args: [CREDENTIAL_ID],
        });
        // Upsert, pas DELETE + INSERT : une seule ligne, rafraîchie.
        expect(session.rows).toHaveLength(1);
        expect(session.rows[0].idToken).toBe('jwt-token');
    });

    it('détecte un véhicule électrique via les données batterie', async () => {
        await seedCredential(CREDENTIAL_ID);
        await seedConnection(VEHICLE_ID, CREDENTIAL_ID);
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

        const data = await getRenaultVehicleData(VEHICLE_ID);
        expect(data.isElectric).toBe(true);
        expect(data.batteryLevel).toBe(85);
    });

    it('dégrade sans lever d\'exception si l\'appel cockpit échoue', async () => {
        await seedCredential(CREDENTIAL_ID);
        await seedConnection(VEHICLE_ID, CREDENTIAL_ID);
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

        const data = await getRenaultVehicleData(VEHICLE_ID);
        expect(data.totalMileage).toBeNull();
        expect(data.vin).toBe(VIN);
    });

    it('lève VinNotOnAccountError sur un 404 cockpit (VIN étranger au compte)', async () => {
        await seedCredential(CREDENTIAL_ID);
        await seedConnection(VEHICLE_ID, CREDENTIAL_ID);
        mockFetch.mockImplementation((url: string | URL) => {
            const u = url.toString();
            if (u.includes('accounts.login')) return jsonResponse({ errorCode: 0, sessionInfo: { cookieValue: 'login-token' } });
            if (u.includes('accounts.getAccountInfo')) return jsonResponse({ data: { personId: 'person-1' } });
            if (u.includes('accounts.getJWT')) return jsonResponse({ id_token: 'jwt-token' });
            if (u.includes('/persons/')) return jsonResponse({ accounts: [{ accountType: 'MYRENAULT', accountId: 'account-1' }] });
            if (u.includes('/cockpit')) return jsonResponse({}, false, 404);
            return jsonResponse({});
        });

        await expect(getRenaultVehicleData(VEHICLE_ID)).rejects.toBeInstanceOf(VinNotOnAccountError);
    });

    it('lève BrandAuthError quand Gigya refuse les identifiants (errorCode ≠ 0)', async () => {
        await seedCredential(CREDENTIAL_ID);
        await seedConnection(VEHICLE_ID, CREDENTIAL_ID);
        mockFetch.mockImplementation((url: string | URL) => {
            if (String(url).includes('accounts.login')) {
                return jsonResponse({ errorCode: 403042, errorMessage: 'invalid loginID or password' });
            }
            return jsonResponse({});
        });

        await expect(getRenaultVehicleData(VEHICLE_ID)).rejects.toBeInstanceOf(BrandAuthError);
    });

    it('lève BrandTransientError si GIGYA_API_KEY est absente (défaut de déploiement, pas un refus d\'identifiants)', async () => {
        delete process.env.GIGYA_API_KEY;
        await seedCredential(CREDENTIAL_ID);
        await seedConnection(VEHICLE_ID, CREDENTIAL_ID);
        mockFullAuthFlow();

        await expect(getRenaultVehicleData(VEHICLE_ID)).rejects.toBeInstanceOf(BrandTransientError);
    });

    it('lève VehicleNotConnectedError quand le véhicule n\'a aucune connexion constructeur', async () => {
        await seedVehicle({ id: 'veh-orphelin', name: 'VEH-ORPHELIN', vin: null });
        mockFullAuthFlow();

        await expect(getRenaultVehicleData('veh-orphelin')).rejects.toBeInstanceOf(VehicleNotConnectedError);
        // Aucun appel constructeur : l'absence de connexion est un état métier,
        // détecté avant toute sollicitation de Gigya.
        expect(mockFetch).not.toHaveBeenCalled();
    });
});
