/**
 * Tests d'intégration — fonctionnalité Désinfection (VPSP).
 *
 * Couvre :
 *   - POST /api/trips (checkout) avec missionType = 'Désinfection'
 *     → vérifie la mise à jour de Vehicle.lastDesinfDate / nextDesinfMaxDate
 *     → rejette les véhicules non-VPSP
 *   - PATCH /api/trips/[id]/checkin pour une mission Désinfection
 *     → exige desinfResponsable + desinfLotNumber
 *     → les sauvegarde en base
 *   - GET /api/vehicles/[id]/desinfections
 *     → retourne la main courante des désinfections
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/renault', () => ({
  getRenaultVehicleData: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/onesignal', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
  notifyRoles: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/trips/route';
import { PATCH } from '@/app/api/trips/[id]/checkin/route';
import { GET as GET_DESINF } from '@/app/api/vehicles/[id]/desinfections/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser, seedTrip } from './setup';

const mockedAuth = vi.mocked(auth);

function makeCheckOutRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeCheckInRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/trips/trip-1/checkin', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(): Request {
  return new Request('http://localhost/api/vehicles/VPSP01/desinfections');
}

const validCheckOutDesinf = {
  vehicleId: 'VPSP001',
  missionType: 'Désinfection',
  conditionOut: 'Bon état',
  dsaChecked: false,
};

const validCheckInBody = {
  conditionIn: 'Bon état',
  mileageIn: 10050,
  fuelIn: 70,
};

describe('Désinfection — checkout (POST /api/trips)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects Désinfection mission on non-VPSP vehicle with 400', async () => {
    await seedUser({ id: 'user-chvpsp', email: 'chvpsp@test.com', name: 'Driver CHVPSP' });
    // VL type vehicle
    await seedVehicle({ id: 'VL001', name: 'VL186', type: 'VL', status: 'AVAILABLE' });

    mockedAuth.mockResolvedValue({
      // @ts-expect-error — partial session for test
      user: { id: 'user-chvpsp', email: 'chvpsp@test.com', roles: ['CHVPSP'] },
    });

    const res = await POST(makeCheckOutRequest({ ...validCheckOutDesinf, vehicleId: 'VL001' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/VPSP/i);
  });

  it('creates trip for VPSP vehicle — desinf dates NOT set yet at checkout', async () => {
    await seedUser({ id: 'user-chvpsp', email: 'chvpsp@test.com', name: 'Driver CHVPSP' });
    await seedVehicle({
      id: 'VPSP001',
      name: 'VPSP01',
      type: 'VPSP',
      status: 'AVAILABLE',
      mileage: 10000,
      fuelLevel: 70,
    });

    mockedAuth.mockResolvedValue({
      // @ts-expect-error — partial session for test
      user: { id: 'user-chvpsp', email: 'chvpsp@test.com', name: 'Driver CHVPSP', roles: ['CHVPSP'] },
    });

    const res = await POST(makeCheckOutRequest(validCheckOutDesinf));
    expect(res.status).toBe(201);

    // Desinf dates are set at CHECKIN, not checkout — should still be null
    const vehicleRes = await db.execute({
      sql: `SELECT lastDesinfDate, nextDesinfMaxDate FROM "Vehicle" WHERE id = 'VPSP001'`,
      args: [],
    });
    const v = vehicleRes.rows[0];
    expect(v.lastDesinfDate).toBeNull();
    expect(v.nextDesinfMaxDate).toBeNull();
  });
});

describe('Désinfection — checkin (PATCH /api/trips/[id]/checkin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when desinfResponsable is missing for Désinfection mission', async () => {
    await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Driver' });
    await seedVehicle({ id: 'VPSP001', name: 'VPSP01', type: 'VPSP', status: 'IN_USE' });
    await seedTrip({
      id: 'trip-1',
      vehicleId: 'VPSP001',
      driverId: 'user-driver',
      missionType: 'Désinfection',
      mileageOut: 10000,
      fuelOut: 70,
    });

    mockedAuth.mockResolvedValue({
      // @ts-expect-error — partial session for test
      user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVPSP'] },
    });

    const res = await PATCH(
      makeCheckInRequest({ ...validCheckInBody, desinfLotNumber: 'LOT-2026-001' }),
      { params: Promise.resolve({ id: 'trip-1' }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/responsable|lot/i);
  });

  it('returns 400 when desinfLotNumber is missing for Désinfection mission', async () => {
    await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Driver' });
    await seedVehicle({ id: 'VPSP001', name: 'VPSP01', type: 'VPSP', status: 'IN_USE' });
    await seedTrip({
      id: 'trip-1',
      vehicleId: 'VPSP001',
      driverId: 'user-driver',
      missionType: 'Désinfection',
      mileageOut: 10000,
      fuelOut: 70,
    });

    mockedAuth.mockResolvedValue({
      // @ts-expect-error — partial session for test
      user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVPSP'] },
    });

    const res = await PATCH(
      makeCheckInRequest({ ...validCheckInBody, desinfResponsable: 'Marc Dupont' }),
      { params: Promise.resolve({ id: 'trip-1' }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/responsable|lot/i);
  });

  it('saves desinfResponsable and desinfLotNumber on successful Désinfection checkin', async () => {
    await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Driver' });
    await seedVehicle({ id: 'VPSP001', name: 'VPSP01', type: 'VPSP', status: 'IN_USE' });
    await seedTrip({
      id: 'trip-1',
      vehicleId: 'VPSP001',
      driverId: 'user-driver',
      missionType: 'Désinfection',
      mileageOut: 10000,
      fuelOut: 70,
    });

    mockedAuth.mockResolvedValue({
      // @ts-expect-error — partial session for test
      user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVPSP'] },
    });

    const res = await PATCH(
      makeCheckInRequest({
        ...validCheckInBody,
        desinfResponsable: 'Marc Dupont',
        desinfLotNumber: 'LOT-2026-042',
      }),
      { params: Promise.resolve({ id: 'trip-1' }) }
    );
    expect(res.status).toBe(200);

    // Verify DB fields were saved
    const tripRes = await db.execute({
      sql: `SELECT desinfResponsable, desinfLotNumber, checkInAt FROM "Trip" WHERE id = 'trip-1'`,
      args: [],
    });
    const t = tripRes.rows[0];
    expect(t.desinfResponsable).toBe('Marc Dupont');
    expect(t.desinfLotNumber).toBe('LOT-2026-042');
    expect(t.checkInAt).toBeTruthy();

    // Verify Vehicle desinf dates set at checkin
    const vehicleRes = await db.execute({
      sql: `SELECT lastDesinfDate, nextDesinfMaxDate FROM "Vehicle" WHERE id = 'VPSP001'`,
      args: [],
    });
    const v = vehicleRes.rows[0];
    expect(v.lastDesinfDate).toBeTruthy();
    expect(v.nextDesinfMaxDate).toBeTruthy();
    const diffDays = Math.round(
      (new Date(v.nextDesinfMaxDate as string).getTime() - new Date(v.lastDesinfDate as string).getTime())
      / (1000 * 60 * 60 * 24)
    );
    expect(diffDays).toBe(42);
  });

  it('does NOT require desinf fields for non-Désinfection missions', async () => {
    await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Driver' });
    await seedVehicle({ id: 'VPSP001', name: 'VPSP01', type: 'VPSP', status: 'IN_USE' });
    await seedTrip({
      id: 'trip-1',
      vehicleId: 'VPSP001',
      driverId: 'user-driver',
      missionType: 'DPS',
      mileageOut: 10000,
      fuelOut: 70,
    });

    mockedAuth.mockResolvedValue({
      // @ts-expect-error — partial session for test
      user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVPSP'] },
    });

    const res = await PATCH(
      makeCheckInRequest(validCheckInBody),
      { params: Promise.resolve({ id: 'trip-1' }) }
    );
    expect(res.status).toBe(200);
  });
});

describe('Désinfection — historique (GET /api/vehicles/[id]/desinfections)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    // @ts-expect-error — null session for test
    mockedAuth.mockResolvedValue(null);

    await seedVehicle({ id: 'VPSP001', name: 'VPSP01', type: 'VPSP' });

    const res = await GET_DESINF(makeGetRequest(), { params: Promise.resolve({ id: 'VPSP01' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown vehicle', async () => {
    mockedAuth.mockResolvedValue({
      // @ts-expect-error — partial session for test
      user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVL'] },
    });

    const res = await GET_DESINF(makeGetRequest(), { params: Promise.resolve({ id: 'UNKNOWN' }) });
    expect(res.status).toBe(404);
  });

  it('returns empty array when no completed desinfection trips', async () => {
    await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Driver' });
    await seedVehicle({ id: 'VPSP001', name: 'VPSP01', type: 'VPSP' });

    mockedAuth.mockResolvedValue({
      // @ts-expect-error — partial session for test
      user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVPSP'] },
    });

    const res = await GET_DESINF(makeGetRequest(), { params: Promise.resolve({ id: 'VPSP01' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.desinfections).toEqual([]);
  });

  it('returns completed desinfection trips with correct fields', async () => {
    await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Marc Dupont' });
    await seedVehicle({ id: 'VPSP001', name: 'VPSP01', type: 'VPSP' });

    // Seed a completed desinfection trip directly in DB
    await db.execute({
      sql: `INSERT INTO "Trip" (
              id, vehicleId, driverId, missionType,
              checkOutAt, checkInAt, mileageOut, mileageIn, fuelOut, fuelIn,
              conditionOut, conditionIn, desinfResponsable, desinfLotNumber
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        'trip-desinf-1', 'VPSP001', 'user-driver', 'Désinfection',
        '2026-03-01T10:00:00.000Z', '2026-03-01T11:00:00.000Z',
        10000, 10050, 70, 68,
        'Bon état', 'Bon état',
        'Marc Dupont', 'LOT-2026-001',
      ],
    });

    // Non-desinfection trip — should not appear
    await db.execute({
      sql: `INSERT INTO "Trip" (
              id, vehicleId, driverId, missionType,
              checkOutAt, checkInAt, mileageOut, mileageIn, fuelOut, fuelIn,
              conditionOut, conditionIn
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        'trip-dps-1', 'VPSP001', 'user-driver', 'DPS',
        '2026-03-02T10:00:00.000Z', '2026-03-02T11:00:00.000Z',
        10050, 10100, 68, 65,
        'Bon état', 'Bon état',
      ],
    });

    // Active (no checkInAt) desinfection — should not appear
    await db.execute({
      sql: `INSERT INTO "Trip" (
              id, vehicleId, driverId, missionType,
              checkOutAt, mileageOut, fuelOut, conditionOut
            ) VALUES (?,?,?,?,?,?,?,?)`,
      args: [
        'trip-desinf-2', 'VPSP001', 'user-driver', 'Désinfection',
        '2026-03-03T10:00:00.000Z', 10100, 65, 'Bon état',
      ],
    });

    mockedAuth.mockResolvedValue({
      // @ts-expect-error — partial session for test
      user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVPSP'] },
    });

    const res = await GET_DESINF(makeGetRequest(), { params: Promise.resolve({ id: 'VPSP01' }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.desinfections).toHaveLength(1);
    const record = body.desinfections[0];
    expect(record.id).toBe('trip-desinf-1');
    expect(record.desinfResponsable).toBe('Marc Dupont');
    expect(record.desinfLotNumber).toBe('LOT-2026-001');
    expect(record.driverName).toBe('Marc Dupont');
  });
});
