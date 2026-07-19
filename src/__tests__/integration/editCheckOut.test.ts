import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { PATCH } from '@/app/api/trips/[id]/checkout/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedTrip, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

function makeRequest(
  tripId: string,
  body: Record<string, unknown>
): [Request, { params: Promise<{ id: string }> }] {
  const request = new Request(`http://localhost/api/trips/${tripId}/checkout`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const context = { params: Promise.resolve({ id: tripId }) };
  return [request, context];
}

const validEditBody = {
  driverId: 'user-driver-1',
  secondDriverId: 'user-driver-2',
  missionType: 'Urgence',
  missionName: 'Garde SAMU 75',
  mileageOut: 50550,
  fuelOut: 85,
  parkingOut: 'Place A3',
  conditionOut: 'Bon état',
  cleanlinessOut: 'Propre',
  commentsOut: 'Ajustement kilométrage départ',
  dsaChecked: true,
};

const driverSession = { user: { id: 'user-driver-1', email: 'driver1@test.com', roles: ['CHVL'] } };
const adminSession = { user: { id: 'admin-id', email: 'admin@test.com', roles: ['ADMIN'] } };
const superAdminSession = { user: { id: 'superadmin-id', email: 'superadmin@test.com', roles: ['SUPER_ADMIN'] } };

describe('PATCH /api/trips/[id]/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    // @ts-expect-error — null session for test
    mockedAuth.mockResolvedValue(null);

    const [req, ctx] = makeRequest('trip-1', validEditBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(401);
  });

  it('returns 403 when user is not ADMIN or SUPER_ADMIN', async () => {
    // @ts-expect-error — driver session
    mockedAuth.mockResolvedValue(driverSession);

    const [req, ctx] = makeRequest('trip-1', validEditBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(403);
  });

  it('returns 404 when trip does not exist', async () => {
    // @ts-expect-error — admin session
    mockedAuth.mockResolvedValue(adminSession);

    const [req, ctx] = makeRequest('nonexistent-trip', validEditBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(404);
  });

  it('returns 400 when trip is already checked in (completed)', async () => {
    // @ts-expect-error — admin session
    mockedAuth.mockResolvedValue(adminSession);
    await seedUser({ id: 'user-driver-1', email: 'driver1@test.com' });
    await seedVehicle();
    await seedTrip({
      id: 'trip-completed',
      driverId: 'user-driver-1',
      checkInAt: new Date().toISOString(),
    });

    const [req, ctx] = makeRequest('trip-completed', validEditBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toMatch(/plus en cours/i);
  });

  it('returns 200 and updates active trip & vehicle when ADMIN modifies pickup details', async () => {
    // @ts-expect-error — admin session
    mockedAuth.mockResolvedValue(adminSession);
    await seedUser({ id: 'user-driver-1', name: 'Conducteur 1', email: 'driver1@test.com' });
    await seedUser({ id: 'user-driver-2', name: 'Conducteur 2', email: 'driver2@test.com' });
    await seedVehicle({ id: 'VL001', status: 'IN_USE', mileage: 50000, fuelLevel: 50 });
    await seedTrip({
      id: 'trip-active-1',
      vehicleId: 'VL001',
      driverId: 'user-driver-1',
      checkInAt: null,
      mileageOut: 50000,
      fuelOut: 50,
      missionType: 'DPS',
    });

    const [req, ctx] = makeRequest('trip-active-1', validEditBody);
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.missionType).toBe('Urgence');
    expect(body.missionName).toBe('Garde SAMU 75');
    expect(body.mileageOut).toBe(50550);
    expect(body.fuelOut).toBe(85);
    expect(body.secondDriverId).toBe('user-driver-2');
    expect(body.secondDriverName).toBe('Conducteur 2');

    // Verify database side effects (Trip table)
    const tripRes = await db.execute({
      sql: `SELECT * FROM Trip WHERE id = ?`,
      args: ['trip-active-1'],
    });
    expect(tripRes.rows[0].missionType).toBe('Urgence');
    expect(tripRes.rows[0].mileageOut).toBe(50550);
    expect(tripRes.rows[0].fuelOut).toBe(85);

    // Verify Vehicle side effects (mileage & fuelLevel synced)
    const vehicleRes = await db.execute({
      sql: `SELECT mileage, fuelLevel FROM Vehicle WHERE id = ?`,
      args: ['VL001'],
    });
    expect(vehicleRes.rows[0].mileage).toBe(50550);
    expect(vehicleRes.rows[0].fuelLevel).toBe(85);
  });

  it('returns 200 when SUPER_ADMIN modifies pickup details', async () => {
    // @ts-expect-error — super admin session
    mockedAuth.mockResolvedValue(superAdminSession);
    await seedUser({ id: 'user-driver-1', name: 'Conducteur 1', email: 'driver1@test.com' });
    await seedVehicle({ id: 'VL002', status: 'IN_USE', mileage: 10000, fuelLevel: 90 });
    await seedTrip({
      id: 'trip-active-2',
      vehicleId: 'VL002',
      driverId: 'user-driver-1',
      checkInAt: null,
      mileageOut: 10000,
      fuelOut: 90,
      missionType: 'DPS',
    });

    const [req, ctx] = makeRequest('trip-active-2', {
      ...validEditBody,
      driverId: 'user-driver-1',
      secondDriverId: null,
      missionType: 'Logistique',
    });

    const response = await PATCH(req, ctx);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.missionType).toBe('Logistique');
    expect(body.secondDriverId).toBeNull();
  });
});
