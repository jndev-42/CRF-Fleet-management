/**
 * Tests d'intégration — GET /api/cron/daily-mileage-check.
 *
 * Route non protégée par NextAuth (déclenchée par Vercel Cron) — sécurisée
 * uniquement par CRON_SECRET si défini. Documente volontairement le
 * comportement fail-open si CRON_SECRET n'est pas configuré (cf. finding
 * sécurité #8, explicitement non corrigé).
 *
 * Le point de substitution est `fetchRenaultVehicleData` (client de fetch), et
 * NON `getRenaultVehicleData` : c'est la couche métier réelle de
 * `@/lib/vehicle-connection` qui doit s'exécuter, sans quoi les transitions de
 * `VehicleConnection.status` — le cœur des cas P6 et N-C ci-dessous — ne
 * seraient jamais exercées.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
// Mock partiel : BrandAuthError / BrandTransientError restent les vraies
// classes, la classification des erreurs par vehicle-connection en dépend.
vi.mock('@/lib/renault', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/renault')>()),
    fetchRenaultVehicleData: vi.fn(),
}));
vi.mock('@/lib/onesignal', () => ({ sendPushNotification: vi.fn().mockResolvedValue(undefined) }));

// Clé de test : lue à chaque appel par `@/lib/crypto`, jamais au chargement du
// module — la poser ici suffit pour `encryptSecret` comme pour `decryptSecret`.
process.env.CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64);

import { GET } from '@/app/api/cron/daily-mileage-check/route';
import { BrandAuthError, BrandTransientError, fetchRenaultVehicleData, type RenaultVehicleData } from '@/lib/renault';
import { encryptSecret } from '@/lib/crypto';
import { db, seedVehicle, seedUser, seedRoles, seedUserRole } from './setup';

const mockedFetch = vi.mocked(fetchRenaultVehicleData);

/** Télémétrie minimale : seul `totalMileage` est lu par le cron. */
function telemetry(totalMileage: number): RenaultVehicleData {
    return {
        vin: 'VF1AB123456789012',
        totalMileage,
        fuelQuantity: null,
        fuelAutonomy: null,
        batteryLevel: null,
        batteryAutonomy: null,
        chargingStatus: null,
        plugStatus: null,
        cockpitTimestamp: null,
        batteryTimestamp: null,
        isElectric: false,
    };
}

async function seedCredential(id: string, ulId = 'ul-paris-18') {
    await db.execute({
        sql: `INSERT INTO BrandCredential (id, ulId, brand, login, passwordEncrypted) VALUES (?,?,?,?,?)`,
        args: [id, ulId, 'RENAULT', `${id}@croix-rouge.fr`, encryptSecret('secret-de-test')],
    });
}

async function seedConnection(
    id: string,
    vehicleId: string,
    credentialId: string,
    status: 'CONNECTED' | 'ERROR' = 'CONNECTED',
    lastError: string | null = null,
) {
    await db.execute({
        sql: `INSERT INTO VehicleConnection (id, vehicleId, credentialId, brand, vin, status, lastError)
              VALUES (?,?,?,?,?,?,?)`,
        args: [id, vehicleId, credentialId, 'RENAULT', `VIN-${vehicleId}`, status, lastError],
    });
}

async function connectionStatus(vehicleId: string) {
    const res = await db.execute({
        sql: `SELECT status, lastError FROM VehicleConnection WHERE vehicleId = ?`,
        args: [vehicleId],
    });
    return res.rows[0];
}

function makeRequest(authHeader?: string): Request {
    return new Request('http://localhost/api/cron/daily-mileage-check', {
        headers: authHeader ? { authorization: authHeader } : {},
    });
}

describe('GET /api/cron/daily-mileage-check', () => {
    const originalSecret = process.env.CRON_SECRET;

    beforeEach(() => {
        mockedFetch.mockReset();
    });

    afterEach(() => {
        process.env.CRON_SECRET = originalSecret;
    });

    it('retourne 401 si CRON_SECRET est défini et l\'en-tête ne correspond pas', async () => {
        process.env.CRON_SECRET = 'my-secret';
        const res = await GET(makeRequest('Bearer wrong-secret'));
        expect(res.status).toBe(401);
    });

    it('accepte la requête avec le bon secret', async () => {
        process.env.CRON_SECRET = 'my-secret';
        const res = await GET(makeRequest('Bearer my-secret'));
        expect(res.status).toBe(200);
    });

    it('documente le comportement fail-open : sans CRON_SECRET configuré, la requête passe sans en-tête (finding sécurité #8, non corrigé)', async () => {
        delete process.env.CRON_SECRET;
        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
    });

    it('supprime les réservations expirées et retourne un résumé (happy path, aucun véhicule connecté)', async () => {
        delete process.env.CRON_SECRET;
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'admin@test.com' });
        await seedUserRole('admin-1', 'ADMIN');
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: null });

        const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        await db.execute({
            sql: `INSERT INTO Reservation (id, vehicleId, userEmail, userName, startTime, endTime, status) VALUES (?,?,?,?,?,?,?)`,
            args: ['res-expired', 'VL001', 'user@test.com', 'User', past, past, 'VALIDATED'],
        });

        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.reservationsDeleted).toBeGreaterThanOrEqual(1);

        const remaining = await db.execute({ sql: `SELECT id FROM Reservation WHERE id = ?`, args: ['res-expired'] });
        expect(remaining.rows).toHaveLength(0);
    });

    it('ignore les véhicules connectés en maintenance sans planter (isMaintenance dérivé de status)', async () => {
        delete process.env.CRON_SECRET;
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'admin@test.com' });
        await seedUserRole('admin-1', 'ADMIN');
        await seedVehicle({ id: 'VL002', name: 'VL200', vin: 'VF1AB123456789012', status: 'MAINTENANCE', mileage: 5000 });
        await seedCredential('cred-1');
        await seedConnection('vc-1', 'VL002', 'cred-1');

        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.alertsSent).toEqual([]);
        // Le `continue` intervient avant tout appel constructeur.
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('poursuit le run quand un véhicule échoue : les suivants sont traités (P6)', async () => {
        delete process.env.CRON_SECRET;
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'admin@test.com' });
        await seedUserRole('admin-1', 'ADMIN');

        // Deux credentials distincts : l'échec du premier ne doit pas court-circuiter
        // le second via le Set `failedCredentials` — on isole bien l'effet du try/catch.
        await seedVehicle({ id: 'VL-KO', name: 'VL KO', status: 'AVAILABLE', mileage: 1000 });
        await seedVehicle({ id: 'VL-OK', name: 'VL OK', status: 'AVAILABLE', mileage: 2000 });
        await seedCredential('cred-ko');
        await seedCredential('cred-ok', 'ul-lyon-3');
        await seedConnection('vc-ko', 'VL-KO', 'cred-ko');
        await seedConnection('vc-ok', 'VL-OK', 'cred-ok');

        mockedFetch.mockImplementation(async (ctx) => {
            if (ctx.credentialId === 'cred-ko') throw new BrandAuthError('Identifiants MyRenault refusés : test');
            return telemetry(2500);
        });

        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        expect(mockedFetch).toHaveBeenCalledTimes(2);

        // Le véhicule qui suit celui en échec a bien été traité.
        const updated = await db.execute({ sql: `SELECT mileage FROM Vehicle WHERE id = ?`, args: ['VL-OK'] });
        expect(updated.rows[0].mileage).toBe(2500);

        expect((await connectionStatus('VL-KO'))?.status).toBe('ERROR');
        expect((await connectionStatus('VL-OK'))?.status).toBe('CONNECTED');
    });

    it('retente une connexion en ERROR au run suivant et la repasse en CONNECTED (aucune condition temporelle)', async () => {
        delete process.env.CRON_SECRET;
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'admin@test.com' });
        await seedUserRole('admin-1', 'ADMIN');

        await seedVehicle({ id: 'VL-ERR', name: 'VL ERR', status: 'AVAILABLE', mileage: 1000 });
        await seedCredential('cred-err');
        // lastCheckedAt reste NULL et le statut est déjà ERROR : rien, dans le
        // code, ne diffère la nouvelle tentative — le backoff a été supprimé.
        await seedConnection('vc-err', 'VL-ERR', 'cred-err', 'ERROR', 'Identifiants MyRenault refusés : run précédent');

        mockedFetch.mockResolvedValue(telemetry(1001));

        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        expect(mockedFetch).toHaveBeenCalledTimes(1);

        const after = await connectionStatus('VL-ERR');
        expect(after?.status).toBe('CONNECTED');
        expect(after?.lastError).toBeNull();
    });

    it('laisse le statut intact sur une erreur transitoire (réseau) — pas de bandeau rouge sur toute la flotte', async () => {
        delete process.env.CRON_SECRET;
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'admin@test.com' });
        await seedUserRole('admin-1', 'ADMIN');

        await seedVehicle({ id: 'VL-NET', name: 'VL NET', status: 'AVAILABLE', mileage: 1000 });
        await seedCredential('cred-net');
        await seedConnection('vc-net', 'VL-NET', 'cred-net');

        mockedFetch.mockRejectedValue(new BrandTransientError('Renault indisponible (cockpit) : ECONNRESET'));

        const res = await GET(makeRequest());
        expect(res.status).toBe(200);

        const after = await connectionStatus('VL-NET');
        expect(after?.status).toBe('CONNECTED');
        expect(after?.lastError).toBeNull();
    });
});
