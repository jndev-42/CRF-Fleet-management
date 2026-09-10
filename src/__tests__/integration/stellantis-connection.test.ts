/**
 * Tests d'intégration — connexion d'un véhicule PSA / Stellantis.
 *
 * DB réelle pour le contexte de connexion et le cache de jetons
 * (`StellantisSession`) ; `fetch` mocké — il porte ici **deux** interlocuteurs
 * distincts, le worker d'authentification et l'API Connected Car.
 *
 * L'enjeu propre à ce fichier est l'aiguillage : une marque PSA doit atteindre
 * `stellantis.ts` sans jamais passer par `renault.ts`, et les échecs du worker
 * doivent se traduire en erreurs typées — seul un refus d'identifiants a le
 * droit de faire basculer un credential en `ERROR`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

import { getRenaultVehicleData } from '@/lib/vehicle-connection';
import { __clearSessionCache } from '@/lib/stellantis';
import { BrandAuthError, BrandTransientError, VinNotOnAccountError } from '@/lib/brand-contract';
import { encryptSecret } from '@/lib/crypto';
import { db, seedUniteLocale, seedVehicle } from './setup';

process.env.CREDENTIALS_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
process.env.PSA_CLIENT_SECRET = 'secret-application-mobile';
process.env.PSA_WORKER_URL = 'https://worker.test';
process.env.PSA_WORKER_SECRET = 'secret-partage';

const UL = 'ul-paris-18';
const VIN = 'VF3AB123456789012';
const PSA_ID = 'opaque-vehicle-id';
const CRED = 'cred-psa';

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as Response;
}

async function seedPsaConnection(): Promise<void> {
    await seedUniteLocale({ id: UL, name: 'Paris 18' });
    await seedVehicle({ id: 'veh-psa', name: 'Kangoo', ulId: UL, vin: VIN, maxFuelCapacity: 60 });
    await db.execute({
        sql: `INSERT INTO BrandCredential (id, ulId, brand, login, passwordEncrypted)
              VALUES (?, ?, 'PEUGEOT', ?, ?)`,
        args: [CRED, UL, 'compte@peugeot.test', encryptSecret('motdepasse')],
    });
    await db.execute({
        sql: `INSERT INTO VehicleConnection (id, vehicleId, credentialId, brand, vin, status)
              VALUES ('conn-psa', 'veh-psa', ?, 'PEUGEOT', ?, 'CONNECTED')`,
        args: [CRED, VIN],
    });
}

/** Worker OK → liste des véhicules → status. La séquence nominale. */
function mockNominalFlow(status: Record<string, unknown>) {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
        jsonResponse({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 3599 })
    );
    fetchMock.mockResolvedValueOnce(
        jsonResponse({ _embedded: { vehicles: [{ id: PSA_ID, vin: VIN }] } })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(status));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

beforeEach(async () => {
    // Le cache de session est au niveau module : sans purge, la session du cas
    // précédent court-circuite le login et décale toutes les réponses mockées.
    __clearSessionCache();
    await seedPsaConnection();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('aiguillage vers le client PSA', () => {
    it('relève la télémétrie d’un véhicule Peugeot', async () => {
        mockNominalFlow({
            odometer: { mileage: 10031.4, createdAt: '2026-09-10T14:59:04Z' },
            energies: [{ type: 'Electric', level: 64, autonomy: 292 }],
        });

        const data = await getRenaultVehicleData('veh-psa');

        expect(data.vin).toBe(VIN);
        expect(data.totalMileage).toBe(10031.4);
        expect(data.batteryLevel).toBe(64);
        expect(data.isElectric).toBe(true);
    });

    it('convertit le carburant avec la capacité du véhicule, pas avec le défaut', async () => {
        // Le véhicule est semé avec `maxFuelCapacity = 60`. Si le contexte ne
        // remontait pas la capacité, la conversion retomberait sur 50 L et la
        // jauge serait fausse de 20 % — silencieusement.
        mockNominalFlow({ energies: [{ type: 'Fuel', level: 50, autonomy: 400 }] });

        const data = await getRenaultVehicleData('veh-psa');

        expect(data.fuelQuantity).toBeCloseTo(30);
        expect(data.isElectric).toBe(false);
    });

    it('met la session en cache et ne rappelle pas le worker au second relevé', async () => {
        const fetchMock = mockNominalFlow({ odometer: { mileage: 100 } });
        await getRenaultVehicleData('veh-psa');

        const workerCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('worker.test'));
        expect(workerCalls).toHaveLength(1);

        const cached = await db.execute({
            sql: `SELECT accessToken, refreshToken FROM StellantisSession WHERE credentialId = ?`,
            args: [CRED],
        });
        expect(cached.rows).toHaveLength(1);
        expect(String(cached.rows[0].refreshToken)).toBe('refresh-1');
    });
});

describe('traduction des échecs', () => {
    it('un 401 du worker lève BrandAuthError et bascule le credential en ERROR', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            jsonResponse({ error: 'AUTH', message: 'Identifiants refusés' }, 401)
        ));

        await expect(getRenaultVehicleData('veh-psa')).rejects.toBeInstanceOf(BrandAuthError);

        const row = await db.execute({
            sql: `SELECT status FROM VehicleConnection WHERE vehicleId = ?`,
            args: ['veh-psa'],
        });
        expect(String(row.rows[0].status)).toBe('ERROR');
    });

    it('un 502 du worker lève BrandTransientError SANS toucher au statut', async () => {
        // Un worker endormi — cas nominal du plan gratuit après 15 min — ne doit
        // pas faire rougir toute la flotte de l'UL.
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            jsonResponse({ error: 'TRANSIENT', message: 'Délai dépassé' }, 502)
        ));

        await expect(getRenaultVehicleData('veh-psa')).rejects.toBeInstanceOf(BrandTransientError);

        const row = await db.execute({
            sql: `SELECT status FROM VehicleConnection WHERE vehicleId = ?`,
            args: ['veh-psa'],
        });
        expect(String(row.rows[0].status)).toBe('CONNECTED');
    });

    it('un VIN absent du compte lève VinNotOnAccountError sans toucher au statut', async () => {
        const fetchMock = vi.fn();
        fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: 'access-1', expiresIn: 3599 }));
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ _embedded: { vehicles: [{ id: 'autre', vin: 'VF3ZZ999999999999' }] } })
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(getRenaultVehicleData('veh-psa')).rejects.toBeInstanceOf(VinNotOnAccountError);

        const row = await db.execute({
            sql: `SELECT status FROM VehicleConnection WHERE vehicleId = ?`,
            args: ['veh-psa'],
        });
        expect(String(row.rows[0].status)).toBe('CONNECTED');
    });
});
