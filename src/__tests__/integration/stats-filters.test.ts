/**
 * Integration tests for GET /api/stats with filter parameters.
 * Verifies vehicleId, driverId, and missionType filters scope results correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET } from '@/app/api/stats/route';
import { seedVehicle, seedUser, seedTrip } from './setup';

const mockedAuth = vi.mocked(auth);

const TODAY = new Date().toISOString().slice(0, 10);

function makeRequest(params: Record<string, string>): Request {
  const url = new URL('http://localhost/api/stats');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

beforeEach(async () => {
  // Create two vehicles, two users, and trips with different combinations
  await seedVehicle({ id: 'VL001', name: 'VL186', maxFuelCapacity: 56 });
  await seedVehicle({ id: 'VL002', name: 'VL188', maxFuelCapacity: 80 });
  await seedUser({ id: 'user-a', email: 'alice@test.com', name: 'Alice' });
  await seedUser({ id: 'user-b', email: 'bob@test.com', name: 'Bob' });

  await seedTrip({
    id: 'trip-1',
    vehicleId: 'VL001',
    driverId: 'user-a',
    missionType: 'Opération',
    checkOutAt: `${TODAY}T08:00:00.000Z`,
  });
  await seedTrip({
    id: 'trip-2',
    vehicleId: 'VL002',
    driverId: 'user-b',
    missionType: 'Formation',
    checkOutAt: `${TODAY}T09:00:00.000Z`,
  });
  await seedTrip({
    id: 'trip-3',
    vehicleId: 'VL001',
    driverId: 'user-b',
    missionType: 'Opération',
    checkOutAt: `${TODAY}T10:00:00.000Z`,
  });
});

describe('GET /api/stats — auth', () => {
  it('returns 401 when unauthenticated', async () => {
    // @ts-expect-error — null session for test
    mockedAuth.mockResolvedValue(null);
    const res = await GET(makeRequest({ dateFrom: TODAY, dateTo: TODAY }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/stats — no filters (happy path)', () => {
  it('returns all 3 trips with no filter', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
    const res = await GET(makeRequest({ dateFrom: TODAY, dateTo: TODAY }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.global.totalTrips).toBe(3);
    // New fields present
    expect(typeof json.data.global.avgLPer100km).toBe('number');
    expect(typeof json.data.global.totalFuelLiters).toBe('number');
    expect(typeof json.data.global.avgFuelAtReturn).toBe('number');
    expect(typeof json.data.global.fleetUtilizationRate).toBe('number');
    expect(typeof json.data.global.incidentRate).toBe('number');
    expect(typeof json.data.global.avgKwhPer100km).toBe('number');
    expect(typeof json.data.global.totalKwhConsumed).toBe('number');
  });
});

describe('GET /api/stats — vehicleId filter', () => {
  it('scopes results to VL001 only (2 trips)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
    const res = await GET(makeRequest({ dateFrom: TODAY, dateTo: TODAY, vehicleId: 'VL001' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.global.totalTrips).toBe(2);
    // byVehicle should only contain VL001
    expect(json.data.byVehicle).toHaveLength(1);
    expect(json.data.byVehicle[0].vehicleId).toBe('VL001');
  });

  it('returns 0 trips for an unknown vehicleId', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
    const res = await GET(makeRequest({ dateFrom: TODAY, dateTo: TODAY, vehicleId: 'UNKNOWN' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.global.totalTrips).toBe(0);
  });
});

describe('GET /api/stats — driverId filter', () => {
  it('scopes results to user-b only (2 trips)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
    const res = await GET(makeRequest({ dateFrom: TODAY, dateTo: TODAY, driverId: 'user-b' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.global.totalTrips).toBe(2);
    expect(json.data.byDriver).toHaveLength(1);
    expect(json.data.byDriver[0].driverName).toBe('Bob');
  });
});

describe('GET /api/stats — missionType filter', () => {
  it('scopes results to Opération only (2 trips)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
    const res = await GET(makeRequest({ dateFrom: TODAY, dateTo: TODAY, missionType: 'Opération' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.global.totalTrips).toBe(2);
  });

  it('scopes results to Formation only (1 trip)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
    const res = await GET(makeRequest({ dateFrom: TODAY, dateTo: TODAY, missionType: 'Formation' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.global.totalTrips).toBe(1);
  });
});

describe('GET /api/stats — combined filters', () => {
  it('vehicle + driver combined returns only matching trip', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
    const res = await GET(makeRequest({
      dateFrom: TODAY,
      dateTo: TODAY,
      vehicleId: 'VL001',
      driverId: 'user-a',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    // Only trip-1 matches VL001 + user-a
    expect(json.data.global.totalTrips).toBe(1);
  });
});

describe('GET /api/stats — byDriver new fields', () => {
  it('includes avgFuelAtReturn and avgLPer100km in byDriver entries', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
    const res = await GET(makeRequest({ dateFrom: TODAY, dateTo: TODAY }));
    const json = await res.json();
    const driver = json.data.byDriver[0];
    expect(typeof driver.avgFuelAtReturn).toBe('number');
    expect(typeof driver.avgLPer100km).toBe('number');
    expect(typeof driver.avgKwhPer100km).toBe('number');
  });
});

describe('GET /api/stats — byVehicle new fields', () => {
  it('includes avgLPer100km in byVehicle entries', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
    const res = await GET(makeRequest({ dateFrom: TODAY, dateTo: TODAY }));
    const json = await res.json();
    const vehicle = json.data.byVehicle[0];
    expect(typeof vehicle.avgLPer100km).toBe('number');
    expect(typeof vehicle.avgKwhPer100km).toBe('number');
  });
});
