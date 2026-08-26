/**
 * Tests d'intégration du endpoint PATCH /api/trips/[id]/checkin (retour de véhicule).
 *
 * Même stratégie que checkout.test.ts : appel direct du handler avec Request mocké,
 * dépendances externes substituées (DB temporaire, auth mockée, Renault/OneSignal désactivés).
 *
 * Cas critiques couverts :
 *  - Autorisation : seuls le conducteur principal, le 2e conducteur et les ADMIN peuvent retourner
 *  - Idempotence : un trajet déjà clôturé (checkInAt non null) retourne 400
 *  - Effet de bord : vehicle.status repasse à AVAILABLE, mileage et fuelLevel mis à jour
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock est hissé (hoisted) — factory async pour accéder à db sans ref circulaire
// DB fichier obligatoire pour la même raison que checkout.test.ts (transaction write)
vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// Simule l'absence de données Renault Connect (véhicule non connecté)
vi.mock('@/lib/renault', () => ({
  getRenaultVehicleData: vi.fn().mockResolvedValue(null),
}));

// Désactive les notifications push pour éviter les appels OneSignal en test
vi.mock('@/lib/onesignal', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
  notifyRoles: vi.fn().mockResolvedValue(undefined),
}));

import { PATCH } from '@/app/api/trips/[id]/checkin/route';
import { auth } from '@/auth';
import { getRenaultVehicleData } from '@/lib/renault';
import { db, seedVehicle, seedTrip, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

// Construit un Request PATCH et le context `params` attendus par le handler Next.js
function makeRequest(
  tripId: string,
  body: Record<string, unknown>
): [Request, { params: Promise<{ id: string }> }] {
  const request = new Request(`http://localhost/api/trips/${tripId}/checkin`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const context = { params: Promise.resolve({ id: tripId }) };
  return [request, context];
}

const validCheckInBody = {
  conditionIn: 'BON',
  mileageIn: 10120,
  fuelIn: 60,
};

// Session objects for mocking — kept as constants so @ts-expect-error applies to a single line
const driverSession = { user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVL'] } };
const otherUserSession = { user: { id: 'other-user', email: 'other@test.com', roles: ['CHVL'] } };
const secondDriverSession = { user: { id: 'user-second', email: 'second@test.com', roles: ['CHVL'] } };
const adminSession = { user: { id: 'admin-id', email: 'admin@test.com', roles: ['ADMIN'] } };

describe('PATCH /api/trips/[id]/checkin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when trip does not exist (checked before auth check)', async () => {
    // La route vérifie l'existence du trajet avant de vérifier l'authentification,
    // donc on a besoin d'une session valide pour atteindre ce code
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);

    const [req, ctx] = makeRequest('nonexistent-trip', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(404); // trip introuvable en base

    const body = await response.json();
    expect(body.error).toMatch(/trouvée/i);
  });

  it('returns 400 when trip is already checked in', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedVehicle();
    await seedTrip({
      id: 'trip-1',
      driverId: 'user-driver',
      checkInAt: new Date(Date.now() - 3600000).toISOString(),
    });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toMatch(/déjà/i);
  });

  it('returns 401 when not authenticated', async () => {
    // @ts-expect-error — null session for test
    mockedAuth.mockResolvedValue(null);
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedVehicle();
    await seedTrip({ id: 'trip-1', driverId: 'user-driver' });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(401);
  });

  it('returns 403 when a different user tries to checkin', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(otherUserSession);
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedVehicle();
    await seedTrip({
      id: 'trip-1',
      driverId: 'user-driver',
      secondDriverId: null,
    });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(403);
  });

  it('returns 200 and vehicle becomes AVAILABLE when primary driver checks in', async () => {
    // Cas nominal : vérifie le retour HTTP ET les effets de bord en base
    // (vehicle.status → AVAILABLE, mileage et fuelLevel mis à jour)
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedVehicle({ id: 'VL001', status: 'IN_USE', mileage: 10000, fuelLevel: 75 });
    await seedTrip({
      id: 'trip-1',
      vehicleId: 'VL001',
      driverId: 'user-driver',
      checkInAt: null,
    });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(200);

    const trip = await response.json();
    expect(trip.checkInAt).toBeTruthy();
    expect(trip.mileageIn).toBe(10120);
    expect(trip.fuelIn).toBe(60);

    // Vérification des effets de bord en base
    const vehicleResult = await db.execute({
      sql: `SELECT status, mileage, fuelLevel FROM "Vehicle" WHERE id = ?`,
      args: ['VL001'],
    });
    expect(vehicleResult.rows[0].status).toBe('AVAILABLE');
    expect(vehicleResult.rows[0].mileage).toBe(10120);
    expect(vehicleResult.rows[0].fuelLevel).toBe(60);
  });

  it('returns 200 when second driver performs the checkin', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(secondDriverSession);
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedUser({ id: 'user-second', email: 'second@test.com' });
    await seedVehicle({ id: 'VL001', status: 'IN_USE' });
    await seedTrip({
      id: 'trip-1',
      vehicleId: 'VL001',
      driverId: 'user-driver',
      secondDriverId: 'user-second',
      checkInAt: null,
    });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(200);
  });

  it('returns 400 without a code when mileageIn is below mileageOut', async () => {
    // Invariant de données : refus sec, non confirmable — le corps ne porte donc aucun `code`.
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedVehicle({ id: 'VL001', status: 'IN_USE', mileage: 10000 });
    await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', mileageOut: 10000 });

    const [req, ctx] = makeRequest('trip-1', { ...validCheckInBody, mileageIn: 9900 });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.code).toBeUndefined();
    expect(body.error).toMatch(/responsable/i);
  });

  it('returns 400 with MILEAGE_CONFIRM_REQUIRED when the delta exceeds the daily cap', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedVehicle({ id: 'VL001', status: 'IN_USE', mileage: 10000 });
    await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', mileageOut: 10000 });

    const [req, ctx] = makeRequest('trip-1', { ...validCheckInBody, mileageIn: 10400 });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.code).toBe('MILEAGE_CONFIRM_REQUIRED');
    expect(body.delta).toBe(400);
    expect(body.maxKm).toBe(150);
    expect(typeof body.durationLabel).toBe('string');

    // Aucun effet de bord : le trajet reste ouvert
    const tripResult = await db.execute({
      sql: `SELECT checkInAt FROM "Trip" WHERE id = ?`,
      args: ['trip-1'],
    });
    expect(tripResult.rows[0].checkInAt).toBeNull();
  });

  it('returns 200 for an excessive delta when confirmMileageAnomaly is true', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedVehicle({ id: 'VL001', status: 'IN_USE', mileage: 10000 });
    await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', mileageOut: 10000 });

    const [req, ctx] = makeRequest('trip-1', {
      ...validCheckInBody,
      mileageIn: 10400,
      confirmMileageAnomaly: true,
    });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(200);

    const trip = await response.json();
    expect(trip.mileageIn).toBe(10400);
  });

  it('returns 200 for a connected vehicle without mileageIn (Renault values are never checked)', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedVehicle({ id: 'VL001', status: 'IN_USE', vin: 'VF1TEST000000001', mileage: 10000 });
    await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', mileageOut: 10000 });

    // Le mock par défaut du fichier renvoie null → garde « Données manquantes ».
    vi.mocked(getRenaultVehicleData).mockResolvedValueOnce({
      vin: 'VF1TEST000000001',
      totalMileage: 99999, fuelQuantity: 30, fuelAutonomy: null,
      batteryLevel: null, batteryAutonomy: null, chargingStatus: null, plugStatus: null,
      cockpitTimestamp: null, batteryTimestamp: null, isElectric: false,
    });

    // Corps sans mileageIn ni fuelIn : delta constructeur de 89 999 km, jamais contrôlé.
    const [req, ctx] = makeRequest('trip-1', { conditionIn: 'BON' });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(200);

    const trip = await response.json();
    expect(trip.mileageIn).toBe(99999);
  });

  it('returns 200 when mileageOut is NULL (Number(null) === 0 must not trigger the check)', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(driverSession);
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedVehicle({ id: 'VL001', status: 'IN_USE', mileage: 10000 });
    await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-driver', mileageOut: null });

    const [req, ctx] = makeRequest('trip-1', { ...validCheckInBody, mileageIn: 10200 });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(200);
  });

  it("returns 200 when ADMIN performs the checkin for someone else's trip", async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue(adminSession);
    await seedUser({ id: 'user-driver', email: 'driver@test.com' });
    await seedVehicle({ id: 'VL001', status: 'IN_USE' });
    await seedTrip({
      id: 'trip-1',
      vehicleId: 'VL001',
      driverId: 'user-driver',
      checkInAt: null,
    });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(200);
  });
});
