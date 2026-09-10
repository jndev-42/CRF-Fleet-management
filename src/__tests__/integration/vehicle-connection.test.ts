/**
 * Tests d'intégration — connexion d'un véhicule à un compte constructeur.
 *
 * `POST` / `PATCH` / `DELETE /api/vehicles/[id]/connection` et
 * `GET /api/brand-credentials`.
 *
 * Le module de chiffrement n'est **pas** mocké : les assertions sur
 * `passwordEncrypted` doivent porter sur un vrai chiffré.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
// `importActual` : les routes importent aussi les classes d'erreur typées de ce
// module, qui doivent rester les vraies pour que les `instanceof` fonctionnent.
vi.mock('@/lib/renault', async () => {
    const actual = await vi.importActual<typeof import('@/lib/renault')>('@/lib/renault');
    return { ...actual, fetchRenaultVehicleData: vi.fn() };
});

import { POST, PATCH, DELETE } from '@/app/api/vehicles/[id]/connection/route';
import { GET as GET_CREDENTIALS } from '@/app/api/brand-credentials/route';
import { auth } from '@/auth';
import { BrandAuthError, VinNotOnAccountError, fetchRenaultVehicleData } from '@/lib/renault';
import { db, seedUniteLocale, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);
const mockedFetch = vi.mocked(fetchRenaultVehicleData);

/** 64 caractères hexadécimaux — même exigence que la production. */
process.env.CREDENTIALS_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
delete process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS;

const UL = 'ul-paris-18';
const OTHER_UL = 'ul-lyon-3';
const VIN_1 = 'VF1AB123456789012';
const VIN_2 = 'VF1CD987654321098';
const LOGIN = 'compte@myrenault.test';
const PASSWORD = 'motdepasse-tres-secret';

const ADMIN = { user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: UL } };
const ADMIN_OTHER_UL = { user: { email: 'admin2@test.com', roles: ['ADMIN'], ulId: OTHER_UL } };
const CHVL = { user: { email: 'chvl@test.com', roles: ['CHVL'], ulId: UL } };

function makeRequest(body: Record<string, unknown>, method = 'POST'): Request {
    return new Request('http://localhost/api/vehicles/veh-1/connection', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function connectionParams(id: string) {
    return { params: Promise.resolve({ id }) };
}

async function countRows(table: 'BrandCredential' | 'VehicleConnection'): Promise<number> {
    const res = await db.execute(`SELECT COUNT(*) AS n FROM "${table}"`);
    return Number(res.rows[0].n);
}

/** Corps complet : VIN + couple identifiant/mot de passe. */
function fullBody(vin = VIN_1) {
    return { brand: 'RENAULT', vin, login: LOGIN, password: PASSWORD };
}

beforeEach(async () => {
    vi.resetAllMocks();
    await seedUniteLocale({ id: UL, name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: OTHER_UL, name: 'Lyon 3', slug: 'lyon-3' });
    await seedVehicle({ id: 'veh-1', name: 'VL186', plate: 'AA-111-AA', ulId: UL, vin: null });
    mockedFetch.mockResolvedValue({ totalMileage: 12345, batteryLevel: 80 } as never);
});

describe('POST /api/vehicles/[id]/connection — accès', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un rôle non administrateur de la même UL', async () => {
        mockedAuth.mockResolvedValue(CHVL as never);
        const res = await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        expect(res.status).toBe(403);
    });

    it("retourne 403 pour un ADMIN d'une autre UL", async () => {
        mockedAuth.mockResolvedValue(ADMIN_OTHER_UL as never);
        const res = await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        expect(res.status).toBe(403);
        expect(await countRows('BrandCredential')).toBe(0);
    });

    it('autorise un SUPER_ADMIN hors UL', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'su@test.com', roles: ['SUPER_ADMIN'], ulId: OTHER_UL } } as never);
        const res = await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        expect(res.status).toBe(201);
    });

    // Fige C1 : `[id]` est l'UUID, jamais le nom — `Vehicle.name` n'a aucune
    // contrainte UNIQUE et un `OR name` pourrait rattacher un secret au
    // véhicule d'une autre UL.
    it("retourne 404 quand [id] est le NOM du véhicule et non son UUID", async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        const res = await POST(makeRequest(fullBody()), connectionParams('VL186'));
        expect(res.status).toBe(404);
        expect(mockedFetch).not.toHaveBeenCalled();
        expect(await countRows('VehicleConnection')).toBe(0);
    });
});

describe('POST /api/vehicles/[id]/connection — validation', () => {
    beforeEach(() => {
        mockedAuth.mockResolvedValue(ADMIN as never);
    });

    it('retourne 400 pour un VIN vide', async () => {
        const res = await POST(makeRequest({ ...fullBody(), vin: '' }), connectionParams('veh-1'));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('Données invalides');
    });

    it('retourne 400 pour une marque inconnue', async () => {
        const res = await POST(makeRequest({ ...fullBody(), brand: 'PEUGEOT' }), connectionParams('veh-1'));
        expect(res.status).toBe(400);
    });

    it('retourne 400 pour un identifiant sans mot de passe', async () => {
        const res = await POST(
            makeRequest({ brand: 'RENAULT', vin: VIN_1, login: LOGIN }),
            connectionParams('veh-1')
        );
        expect(res.status).toBe(400);
    });

    it("retourne 400 sans couple fourni quand l'UL n'a aucun compte enregistré", async () => {
        const res = await POST(makeRequest({ brand: 'RENAULT', vin: VIN_1 }), connectionParams('veh-1'));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('Aucun compte MyRenault enregistré pour cette UL');
        expect(mockedFetch).not.toHaveBeenCalled();
    });
});

describe('POST /api/vehicles/[id]/connection — validation live avant écriture', () => {
    beforeEach(() => {
        mockedAuth.mockResolvedValue(ADMIN as never);
    });

    it('retourne 400 sur identifiants refusés, sans rien écrire', async () => {
        mockedFetch.mockRejectedValue(new BrandAuthError('errorCode 403042'));

        const res = await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('Identifiants MyRenault refusés');

        expect(await countRows('BrandCredential')).toBe(0);
        expect(await countRows('VehicleConnection')).toBe(0);
        const vehicle = await db.execute(`SELECT vin FROM "Vehicle" WHERE id = 'veh-1'`);
        expect(vehicle.rows[0].vin).toBeNull();
    });

    it('retourne 400 sur VIN introuvable, sans rien écrire', async () => {
        mockedFetch.mockRejectedValue(new VinNotOnAccountError('VIN absent du compte'));

        const res = await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('VIN introuvable sur ce compte MyRenault');

        expect(await countRows('BrandCredential')).toBe(0);
        expect(await countRows('VehicleConnection')).toBe(0);
    });
});

describe('POST /api/vehicles/[id]/connection — happy path', () => {
    beforeEach(() => {
        mockedAuth.mockResolvedValue(ADMIN as never);
    });

    it('crée le compte, la connexion et synchronise Vehicle.vin', async () => {
        const res = await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        expect(res.status).toBe(201);

        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.connection).toMatchObject({ brand: 'RENAULT', vin: VIN_1, status: 'CONNECTED' });
        expect(body.data.totalMileage).toBe(12345);

        expect(await countRows('BrandCredential')).toBe(1);
        expect(await countRows('VehicleConnection')).toBe(1);

        const vehicle = await db.execute(`SELECT vin FROM "Vehicle" WHERE id = 'veh-1'`);
        expect(vehicle.rows[0].vin).toBe(VIN_1);
    });

    it('chiffre le mot de passe au format « iv:authTag:ciphertext »', async () => {
        await POST(makeRequest(fullBody()), connectionParams('veh-1'));

        const cred = await db.execute(`SELECT login, passwordEncrypted FROM "BrandCredential"`);
        const stored = String(cred.rows[0].passwordEncrypted);
        expect(cred.rows[0].login).toBe(LOGIN);
        expect(stored).not.toContain(PASSWORD);
        expect(stored.split(':')).toHaveLength(3);
        expect(stored.split(':').every(segment => segment.length > 0)).toBe(true);
    });

    it("réutilise le compte de l'UL au 2ᵉ véhicule (VIN seul) et n'en crée pas un second", async () => {
        await seedVehicle({ id: 'veh-2', name: 'VL187', plate: 'BB-222-BB', ulId: UL, vin: null });

        await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        const res = await POST(makeRequest({ brand: 'RENAULT', vin: VIN_2 }), connectionParams('veh-2'));
        expect(res.status).toBe(201);

        expect(await countRows('BrandCredential')).toBe(1);
        expect(await countRows('VehicleConnection')).toBe(2);

        const connections = await db.execute(`SELECT DISTINCT credentialId FROM "VehicleConnection"`);
        expect(connections.rows).toHaveLength(1);
    });

    // L'unicité repose sur l'index unique, jamais sur une FK : les FK ne sont
    // pas activées (aucun PRAGMA foreign_keys).
    it("l'index unique (ulId, brand) rejette un second compte pour la même UL", async () => {
        await POST(makeRequest(fullBody()), connectionParams('veh-1'));

        await expect(db.execute({
            sql: `INSERT INTO "BrandCredential" (id, ulId, brand, login, passwordEncrypted, createdAt, updatedAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: ['autre-id', UL, 'RENAULT', 'autre@test.fr', 'iv:tag:cipher', 'now', 'now'],
        })).rejects.toThrow(/UNIQUE/i);
    });

    it('un second POST sur le même véhicule ne crée pas de doublon de connexion', async () => {
        await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        const res = await POST(makeRequest(fullBody(VIN_2)), connectionParams('veh-1'));
        expect(res.status).toBe(201);

        expect(await countRows('VehicleConnection')).toBe(1);
        const conn = await db.execute(`SELECT vin FROM "VehicleConnection"`);
        expect(conn.rows[0].vin).toBe(VIN_2);
    });
});

describe('Aucune réponse ne divulgue le mot de passe', () => {
    beforeEach(() => {
        mockedAuth.mockResolvedValue(ADMIN as never);
    });

    it('ni sur succès, ni sur erreur, ni via le compte enregistré', async () => {
        const created = await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        const createdBody = JSON.stringify(await created.json());

        const stored = await db.execute(`SELECT passwordEncrypted FROM "BrandCredential"`);
        const encrypted = String(stored.rows[0].passwordEncrypted);

        for (const payload of [createdBody]) {
            expect(payload).not.toContain(PASSWORD);
            expect(payload).not.toContain(encrypted);
            expect(payload).not.toContain('password');
            expect(payload).not.toContain('credentialId');
        }

        mockedFetch.mockRejectedValue(new BrandAuthError(`refus pour ${LOGIN}`));
        const refused = await POST(makeRequest(fullBody(VIN_2)), connectionParams('veh-1'));
        const refusedBody = JSON.stringify(await refused.json());
        expect(refusedBody).not.toContain(PASSWORD);
        expect(refusedBody).not.toContain(encrypted);

        const credentials = await GET_CREDENTIALS(new Request('http://localhost/api/brand-credentials?brand=RENAULT'));
        const credentialsBody = JSON.stringify(await credentials.json());
        expect(credentialsBody).not.toContain(PASSWORD);
        expect(credentialsBody).not.toContain(encrypted);
        expect(credentialsBody).not.toContain('password');
    });
});

describe('PATCH /api/vehicles/[id]/connection', () => {
    beforeEach(() => {
        mockedAuth.mockResolvedValue(ADMIN as never);
    });

    it('retourne 404 quand aucune connexion n’existe', async () => {
        const res = await PATCH(makeRequest(fullBody(), 'PATCH'), connectionParams('veh-1'));
        expect(res.status).toBe(404);
    });

    it('met à jour le VIN et conserve la connexion existante', async () => {
        await POST(makeRequest(fullBody()), connectionParams('veh-1'));

        const res = await PATCH(
            makeRequest({ brand: 'RENAULT', vin: VIN_2 }, 'PATCH'),
            connectionParams('veh-1')
        );
        expect(res.status).toBe(200);

        expect(await countRows('VehicleConnection')).toBe(1);
        const conn = await db.execute(`SELECT vin, status FROM "VehicleConnection"`);
        expect(conn.rows[0].vin).toBe(VIN_2);
        expect(conn.rows[0].status).toBe('CONNECTED');
    });

    it('sans vin, conserve celui de la connexion existante', async () => {
        await POST(makeRequest(fullBody()), connectionParams('veh-1'));

        const res = await PATCH(
            makeRequest({ brand: 'RENAULT', login: LOGIN, password: 'nouveau-mot-de-passe' }, 'PATCH'),
            connectionParams('veh-1')
        );
        expect(res.status).toBe(200);
        expect((await res.json()).connection.vin).toBe(VIN_1);
        expect(await countRows('BrandCredential')).toBe(1);
    });
});

describe('DELETE /api/vehicles/[id]/connection', () => {
    beforeEach(() => {
        mockedAuth.mockResolvedValue(ADMIN as never);
    });

    it('retourne 404 quand aucune connexion n’existe', async () => {
        const res = await DELETE(makeRequest({}, 'DELETE'), connectionParams('veh-1'));
        expect(res.status).toBe(404);
    });

    it('ne supprime le compte qu’au retrait du DERNIER véhicule, et purge sa session', async () => {
        await seedVehicle({ id: 'veh-2', name: 'VL187', plate: 'BB-222-BB', ulId: UL, vin: null });
        await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        await POST(makeRequest({ brand: 'RENAULT', vin: VIN_2 }), connectionParams('veh-2'));

        const cred = await db.execute(`SELECT id FROM "BrandCredential"`);
        const credentialId = String(cred.rows[0].id);
        await db.execute({
            sql: `INSERT INTO "RenaultSession" (idToken, accountId, expiresAt, credentialId) VALUES (?, ?, ?, ?)`,
            args: ['jwt-de-test', 'account-1', Date.now() + 60_000, credentialId],
        });

        const first = await DELETE(makeRequest({}, 'DELETE'), connectionParams('veh-1'));
        expect(first.status).toBe(200);
        expect((await first.json()).credentialDeleted).toBe(false);
        expect(await countRows('BrandCredential')).toBe(1);
        expect(await countRows('VehicleConnection')).toBe(1);

        const second = await DELETE(makeRequest({}, 'DELETE'), connectionParams('veh-2'));
        expect(second.status).toBe(200);
        expect((await second.json()).credentialDeleted).toBe(true);
        expect(await countRows('BrandCredential')).toBe(0);
        expect(await countRows('VehicleConnection')).toBe(0);

        const sessions = await db.execute({
            sql: `SELECT COUNT(*) AS n FROM "RenaultSession" WHERE credentialId = ?`,
            args: [credentialId],
        });
        expect(Number(sessions.rows[0].n)).toBe(0);
    });

    it('conserve Vehicle.vin après déconnexion', async () => {
        await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        await DELETE(makeRequest({}, 'DELETE'), connectionParams('veh-1'));

        const vehicle = await db.execute(`SELECT vin FROM "Vehicle" WHERE id = 'veh-1'`);
        expect(vehicle.rows[0].vin).toBe(VIN_1);
    });

    it('retourne 403 pour un ADMIN d’une autre UL', async () => {
        await POST(makeRequest(fullBody()), connectionParams('veh-1'));
        mockedAuth.mockResolvedValue(ADMIN_OTHER_UL as never);

        const res = await DELETE(makeRequest({}, 'DELETE'), connectionParams('veh-1'));
        expect(res.status).toBe(403);
        expect(await countRows('VehicleConnection')).toBe(1);
    });
});

describe('GET /api/brand-credentials', () => {
    const request = (query = '?brand=RENAULT') =>
        new Request(`http://localhost/api/brand-credentials${query}`);

    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await GET_CREDENTIALS(request())).status).toBe(401);
    });

    it('retourne 403 pour un rôle non administrateur', async () => {
        mockedAuth.mockResolvedValue(CHVL as never);
        expect((await GET_CREDENTIALS(request())).status).toBe(403);
    });

    it('retourne 403 sur ?ulId= pour un ADMIN (réservé au SUPER_ADMIN)', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        expect((await GET_CREDENTIALS(request(`?brand=RENAULT&ulId=${OTHER_UL}`))).status).toBe(403);
    });

    it('retourne 400 pour une marque inconnue', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        expect((await GET_CREDENTIALS(request('?brand=PEUGEOT'))).status).toBe(400);
    });

    it('retourne null quand aucun compte n’est enregistré', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        const res = await GET_CREDENTIALS(request());
        expect(res.status).toBe(200);
        expect((await res.json()).credential).toBeNull();
    });

    it('retourne la marque et le login, jamais le mot de passe', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        await POST(makeRequest(fullBody()), connectionParams('veh-1'));

        const res = await GET_CREDENTIALS(request());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.credential).toEqual({ brand: 'RENAULT', login: LOGIN });
    });
});
