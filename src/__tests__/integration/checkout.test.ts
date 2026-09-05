/**
 * Tests d'intégration du endpoint POST /api/trips (prise de véhicule / checkout).
 *
 * Stratégie : on appelle directement le handler Next.js (`POST`) avec de vrais
 * objets `Request`, en mockant uniquement les dépendances externes :
 *  - `@/lib/db`       → remplacé par la DB SQLite fichier temporaire de ./setup.ts
 *  - `@/auth`         → session mockée pour simuler différents rôles
 *  - `@/lib/renault`  → aucun appel réseau réel (retourne null = pas de données connectées)
 *  - `@/lib/onesignal`→ notifications désactivées en test
 *
 * Tous les tests vérifient le code HTTP de la réponse ET, pour les cas critiques,
 * l'état de la base de données après l'appel (effet de bord sur Vehicle.status).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock est hissé (hoisted) au début du fichier par Vitest.
// On utilise une factory async avec import() dynamique pour accéder à `db`
// depuis ./setup sans déclencher d'erreur de référence circulaire.
// DB fichier obligatoire : db.transaction('write') ouvre une 2e connexion
// qui verrait une base vide avec file::memory:.
vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});

// Mock de la session NextAuth — chaque test configure le retour via mockedAuth
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// Pas d'appel Renault en test — on simule l'absence de données connectées
vi.mock('@/lib/renault', () => ({
  getRenaultVehicleData: vi.fn().mockResolvedValue(null),
}));

// Désactive les notifications push pour éviter les appels OneSignal en test
vi.mock('@/lib/onesignal', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
  notifyRoles: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/trips/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

// Construit un Request HTTP POST simulant un appel client vers l'API
function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validCheckOutBody = {
  vehicleId: 'VL001',
  missionType: 'LOGISTIQUE',
  conditionOut: 'BON',
  dsaChecked: false,
};

// Session objects for mocking — kept as constants so @ts-expect-error applies to a single line
const guestSession = { user: { id: 'guest-id', email: 'guest@test.com', roles: ['GUEST'] } };
const driverSession = { user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVL'] } };
const driverWithNameSession = { user: { id: 'user-driver', email: 'driver@test.com', name: 'Test Driver', roles: ['CHVL'] } };
const adminSession = { user: { id: 'admin-id', email: 'admin@test.com', roles: ['ADMIN'] } };

describe('POST /api/trips (checkout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    // @ts-expect-error — null session for test
    mockedAuth.mockResolvedValue(null);

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toMatch(/authentifi/i);
  });

  it('returns 403 when user has only GUEST role', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(guestSession);
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(403);
  });

  it('returns 404 when vehicle does not exist', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);

    const response = await POST(makeRequest({ ...validCheckOutBody, vehicleId: 'NONEXISTENT' }));
    expect(response.status).toBe(404);
  });

  it('returns 400 when vehicle is not AVAILABLE', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);
    await seedVehicle({ id: 'VL001', status: 'IN_USE' });

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toMatch(/disponible/i);
  });

  it('returns 201 and sets vehicle to IN_USE on successful checkout', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverWithNameSession);
    await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Test Driver' });
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE', mileage: 10000, fuelLevel: 75 });

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(201);

    const trip = await response.json();
    expect(trip.vehicleId).toBe('VL001');
    expect(trip.driverId).toBe('user-driver');
    expect(trip.missionType).toBe('LOGISTIQUE');
    // checkInAt doit être null au checkout — il sera rempli au retour
    expect(trip.checkInAt == null).toBe(true);

    // Vérification de l'effet de bord en base : le véhicule doit être IN_USE
    const vehicleResult = await db.execute({
      sql: `SELECT status FROM "Vehicle" WHERE id = ?`,
      args: ['VL001'],
    });
    expect(vehicleResult.rows[0].status).toBe('IN_USE');
  });

  it('returns 400 for invalid Zod body (missing conditionOut)', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { conditionOut: _conditionOut, ...bodyWithoutCondition } = validCheckOutBody;
    const response = await POST(makeRequest(bodyWithoutCondition));
    expect(response.status).toBe(400);
  });

  it('allows ADMIN role to checkout any vehicle type', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(adminSession);
    await seedUser({ id: 'admin-id', email: 'admin@test.com', name: 'Admin Test' });
    // Les véhicules VPSP sont normalement réservés aux rôles CHVPSP et ADMIN
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE', type: 'VPSP' });

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(201);
  });

  it('returns 403 when CHVL tries to checkout a VPSP vehicle', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE', type: 'VPSP' });

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(403);
  });
  // ── Garde des papiers de conduite (POST /api/trips) ───────────────────────
  // Jusqu'ici la validité n'était vérifiée qu'à l'affichage : le serveur laissait
  // passer un conducteur aux papiers périmés. La garde rejoue la décision de
  // `getLicenseStatus` en lecture seule — elle ne doit jamais écrire en base.
  describe('garde des papiers de conduite', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const GRACE_DAYS = 14;

    /** Date au format YYYY-MM-DD, décalée de `days` par rapport à aujourd'hui. */
    function isoDay(days: number) {
      return new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
    }

    it('returns 403 when the driver license grace period has expired', async () => {
      mockedAuth.mockResolvedValue(driverSession as never);
      await seedUser({
        id: 'user-driver',
        email: 'driver@test.com',
        name: 'Test Driver',
        papiers_valides: 0,
        last_validation: null,
        start_date_invalidation_process: isoDay(-GRACE_DAYS),
      });
      await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });

      const response = await POST(makeRequest(validCheckOutBody));
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.error).toMatch(/papiers n'ont pas été validés dans les délais/i);

      const vehicleResult = await db.execute({
        sql: `SELECT status FROM "Vehicle" WHERE id = ?`,
        args: ['VL001'],
      });
      expect(vehicleResult.rows[0].status).toBe('AVAILABLE');
    });

    it('allows checkout while still inside the grace period', async () => {
      mockedAuth.mockResolvedValue(driverWithNameSession as never);
      await seedUser({
        id: 'user-driver',
        email: 'driver@test.com',
        name: 'Test Driver',
        papiers_valides: 0,
        last_validation: null,
        start_date_invalidation_process: isoDay(-(GRACE_DAYS - 3)),
      });
      await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });

      const response = await POST(makeRequest(validCheckOutBody));
      expect(response.status).toBe(201);
    });

    it('allows checkout when the license is valid', async () => {
      mockedAuth.mockResolvedValue(driverWithNameSession as never);
      await seedUser({
        id: 'user-driver',
        email: 'driver@test.com',
        name: 'Test Driver',
        papiers_valides: 1,
        last_validation: isoDay(-10),
      });
      await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });

      const response = await POST(makeRequest(validCheckOutBody));
      expect(response.status).toBe(201);
    });

    it('allows an ADMIN to bypass an expired license', async () => {
      mockedAuth.mockResolvedValue(adminSession as never);
      await seedUser({
        id: 'admin-id',
        email: 'admin@test.com',
        name: 'Admin User',
        papiers_valides: 0,
        last_validation: null,
        start_date_invalidation_process: isoDay(-GRACE_DAYS),
      });
      await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });

      const response = await POST(makeRequest(validCheckOutBody));
      expect(response.status).toBe(201);
    });

    it('does not apply the license guard to a non-driver role', async () => {
      mockedAuth.mockResolvedValue(guestSession as never);
      await seedUser({
        id: 'guest-id',
        email: 'guest@test.com',
        name: 'Guest User',
        papiers_valides: 0,
        last_validation: null,
        start_date_invalidation_process: isoDay(-GRACE_DAYS),
      });
      await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });

      const response = await POST(makeRequest(validCheckOutBody));
      const body = await response.json();
      expect(body.error).not.toMatch(/papiers/i);
    });
  });

  // ── Garde de réservation (POST /api/trips) ────────────────────────────────
  // Un véhicule couvert par une réservation VALIDATED active n'est empruntable
  // que par son détenteur, ou par un administrateur.
  describe('garde de réservation', () => {
    const HOUR = 60 * 60 * 1000;

    async function seedReservation(overrides: Partial<{
      id: string;
      vehicleId: string;
      userEmail: string;
      userName: string;
      startTime: string;
      endTime: string;
      status: string;
    }> = {}) {
      const r = {
        id: 'res-1',
        vehicleId: 'VL001',
        userEmail: 'other@test.com',
        userName: 'Other User',
        startTime: new Date(Date.now() - HOUR).toISOString(),
        endTime: new Date(Date.now() + HOUR).toISOString(),
        status: 'VALIDATED',
        ...overrides,
      };
      await db.execute({
        sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [r.id, r.vehicleId, r.userEmail, r.userName, r.startTime, r.endTime, r.status],
      });
    }

    it('returns 403 when an active VALIDATED reservation is held by someone else', async () => {
      // @ts-expect-error — partial session object for testing
      mockedAuth.mockResolvedValue(driverSession);
      await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Test Driver' });
      await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });
      await seedReservation();

      const response = await POST(makeRequest(validCheckOutBody));
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.error).toMatch(/réservé par un autre utilisateur/i);

      // Aucun effet de bord : le véhicule reste disponible
      const vehicleResult = await db.execute({
        sql: `SELECT status FROM "Vehicle" WHERE id = ?`,
        args: ['VL001'],
      });
      expect(vehicleResult.rows[0].status).toBe('AVAILABLE');
    });

    it('allows checkout when the active VALIDATED reservation is the driver\'s own', async () => {
      // @ts-expect-error — partial session object for testing
      mockedAuth.mockResolvedValue(driverSession);
      await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Test Driver' });
      await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });
      await seedReservation({ userEmail: 'driver@test.com', userName: 'Test Driver' });

      const response = await POST(makeRequest(validCheckOutBody));
      expect(response.status).toBe(201);
    });

    it('allows checkout when a third-party reservation is only PENDING', async () => {
      // @ts-expect-error — partial session object for testing
      mockedAuth.mockResolvedValue(driverSession);
      await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Test Driver' });
      await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });
      await seedReservation({ status: 'PENDING' });

      const response = await POST(makeRequest(validCheckOutBody));
      expect(response.status).toBe(201);
    });

    it('allows checkout when the third-party VALIDATED reservation starts in the future', async () => {
      // @ts-expect-error — partial session object for testing
      mockedAuth.mockResolvedValue(driverSession);
      await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Test Driver' });
      await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });
      await seedReservation({
        startTime: new Date(Date.now() + HOUR).toISOString(),
        endTime: new Date(Date.now() + 3 * HOUR).toISOString(),
      });

      const response = await POST(makeRequest(validCheckOutBody));
      expect(response.status).toBe(201);
    });

    it('allows an ADMIN to bypass a third-party VALIDATED reservation', async () => {
      // @ts-expect-error — partial session object for testing
      mockedAuth.mockResolvedValue(adminSession);
      await seedUser({ id: 'admin-id', email: 'admin@test.com', name: 'Admin Test' });
      await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });
      await seedReservation();

      const response = await POST(makeRequest(validCheckOutBody));
      expect(response.status).toBe(201);
    });
  });
});
