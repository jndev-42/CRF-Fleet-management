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
import { db, seedVehicle, seedTrip } from './setup';

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
  mileageIn: 10200,
  fuelIn: 60,
};

describe('PATCH /api/trips/[id]/checkin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when trip does not exist (checked before auth check)', async () => {
    // La route vérifie l'existence du trajet avant de vérifier l'authentification,
    // donc on a besoin d'une session valide pour atteindre ce code
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { email: 'driver@test.com', roles: ['CHVL'] },
    });

    const [req, ctx] = makeRequest('nonexistent-trip', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(404); // trip introuvable en base

    const body = await response.json();
    expect(body.error).toMatch(/trouvée/i);
  });

  it('returns 400 when trip is already checked in', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { email: 'driver@test.com', roles: ['CHVL'] },
    });
    await seedVehicle();
    await seedTrip({
      id: 'trip-1',
      driverEmail: 'driver@test.com',
      checkInAt: new Date(Date.now() - 3600000).toISOString(),
    });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toMatch(/déjà/i);
  });

  it('returns 401 when not authenticated', async () => {
    // @ts-expect-error — auth returns null in test
    mockedAuth.mockResolvedValue(null);
    await seedVehicle();
    await seedTrip({ id: 'trip-1', driverEmail: 'driver@test.com' });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(401);
  });

  it('returns 403 when a different user tries to checkin', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { email: 'other@test.com', roles: ['CHVL'] },
    });
    await seedVehicle();
    await seedTrip({
      id: 'trip-1',
      driverEmail: 'driver@test.com',
      secondDriverEmail: null,
    });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(403);
  });

  it('returns 200 and vehicle becomes AVAILABLE when primary driver checks in', async () => {
    // Cas nominal : vérifie le retour HTTP ET les effets de bord en base
    // (vehicle.status → AVAILABLE, mileage et fuelLevel mis à jour)
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { email: 'driver@test.com', roles: ['CHVL'] },
    });
    await seedVehicle({ id: 'VL001', status: 'IN_USE', mileage: 10000, fuelLevel: 75 });
    await seedTrip({
      id: 'trip-1',
      vehicleId: 'VL001',
      driverEmail: 'driver@test.com',
      checkInAt: null,
    });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(200);

    const trip = await response.json();
    expect(trip.checkInAt).toBeTruthy();
    expect(trip.mileageIn).toBe(10200);
    expect(trip.fuelIn).toBe(60);

    // Vérification des effets de bord en base
    const vehicleResult = await db.execute({
      sql: `SELECT status, mileage, fuelLevel FROM "Vehicle" WHERE id = ?`,
      args: ['VL001'],
    });
    expect(vehicleResult.rows[0].status).toBe('AVAILABLE');
    expect(vehicleResult.rows[0].mileage).toBe(10200);
    expect(vehicleResult.rows[0].fuelLevel).toBe(60);
  });

  it('returns 200 when second driver performs the checkin', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { email: 'second@test.com', roles: ['CHVL'] },
    });
    await seedVehicle({ id: 'VL001', status: 'IN_USE' });
    await seedTrip({
      id: 'trip-1',
      vehicleId: 'VL001',
      driverEmail: 'driver@test.com',
      secondDriverEmail: 'second@test.com',
      checkInAt: null,
    });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(200);
  });

  it("returns 200 when ADMIN performs the checkin for someone else's trip", async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@test.com', roles: ['ADMIN'] },
    });
    await seedVehicle({ id: 'VL001', status: 'IN_USE' });
    await seedTrip({
      id: 'trip-1',
      vehicleId: 'VL001',
      driverEmail: 'driver@test.com',
      checkInAt: null,
    });

    const [req, ctx] = makeRequest('trip-1', validCheckInBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(200);
  });
});
