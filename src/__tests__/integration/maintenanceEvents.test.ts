import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST, PATCH } from '@/app/api/vehicles/[id]/maintenance-events/route';
import { GET as GETVehicle } from '@/app/api/vehicles/[id]/route';
import { GET as GETVehicles } from '@/app/api/vehicles/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

function makePostRequest(vehicleName: string, body: unknown): Request {
  return new Request(`http://localhost/api/vehicles/${vehicleName}/maintenance-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(vehicleName: string): Request {
  return new Request(`http://localhost/api/vehicles/${vehicleName}/maintenance-events`, {
    method: 'PATCH',
  });
}

beforeEach(async () => {
  await seedUser({ id: 'user-admin', email: 'admin@dev.local', name: 'Admin User', roles: ['ADMIN'], ulId: 'ul-paris' });
  await seedUser({ id: 'user-benevole', email: 'benevole@dev.local', name: 'Benevole User', roles: ['BENEVOLE'], ulId: 'ul-paris' });
  await seedVehicle({ id: 'v-1', name: 'VSAV 01', plate: 'AB-123-CD', status: 'AVAILABLE', ulId: 'ul-paris' });
});

describe('POST /api/vehicles/[id]/maintenance-events', () => {
  it('returns 401 if unauthenticated', async () => {
    // @ts-expect-error null session for test
    mockedAuth.mockResolvedValue(null);
    const res = await POST(makePostRequest('VSAV 01', { startDate: '2026-07-22', reason: 'Test' }), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 if user is not admin', async () => {
    // @ts-expect-error session for test
    mockedAuth.mockResolvedValue({
      user: { email: 'benevole@dev.local', roles: ['BENEVOLE'], ulId: 'ul-paris' },
    });
    const res = await POST(makePostRequest('VSAV 01', { startDate: '2026-07-22', reason: 'Test' }), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 if reason or startDate is missing', async () => {
    // @ts-expect-error session for test
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    });
    const res = await POST(makePostRequest('VSAV 01', { startDate: '', reason: '' }), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });
    expect(res.status).toBe(400);
  });

  it('creates maintenance event and updates vehicle status to MAINTENANCE', async () => {
    // @ts-expect-error session for test
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    });

    const res = await POST(
      makePostRequest('VSAV 01', {
        startDate: '2026-07-22',
        endDate: '2026-07-25',
        reason: 'Changement de pneus',
      }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.maintenance.reason).toBe('Changement de pneus');
    expect(json.maintenance.startDate).toBe('2026-07-22');
    expect(json.maintenance.endDate).toBe('2026-07-25');

    // Check DB side effects
    const v = await db.execute({ sql: `SELECT status FROM "Vehicle" WHERE id = 'v-1'`, args: [] });
    expect(v.rows[0].status).toBe('MAINTENANCE');

    const m = await db.execute({ sql: `SELECT * FROM "VehicleMaintenance" WHERE vehicleId = 'v-1'`, args: [] });
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].reason).toBe('Changement de pneus');
  });

  it('does NOT set vehicle status to MAINTENANCE immediately if start date is in the future', async () => {
    // @ts-expect-error session for test
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 5);
    const futureDate = tomorrow.toISOString().split('T')[0];

    const res = await POST(
      makePostRequest('VSAV 01', {
        startDate: futureDate,
        endDate: null,
        reason: 'Maintenance future prévue dans 5 jours',
      }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );

    expect(res.status).toBe(201);

    // Vehicle status should remain AVAILABLE today since start date is in the future
    const v = await db.execute({ sql: `SELECT status FROM "Vehicle" WHERE id = 'v-1'`, args: [] });
    expect(v.rows[0].status).toBe('AVAILABLE');
  });

  it('handles unknown end date (endDate = null)', async () => {
    // @ts-expect-error session for test
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    });

    const res = await POST(
      makePostRequest('VSAV 01', {
        startDate: '2026-07-22',
        endDate: null,
        reason: 'Panne moteur grave',
      }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.maintenance.endDate).toBeNull();
  });
});

describe('PATCH /api/vehicles/[id]/maintenance-events', () => {
  it('ends active maintenance, sets endDate to today, and updates vehicle status to AVAILABLE', async () => {
    // @ts-expect-error session for test
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    });

    // First put in maintenance
    await POST(
      makePostRequest('VSAV 01', {
        startDate: '2026-07-20',
        endDate: null,
        reason: 'Révision Renault',
      }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );

    // Now end maintenance
    const res = await PATCH(makePatchRequest('VSAV 01'), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.endDate).toContain(new Date().toISOString().split('T')[0]);

    // Check DB side effects
    const v = await db.execute({ sql: `SELECT status FROM "Vehicle" WHERE id = 'v-1'`, args: [] });
    expect(v.rows[0].status).toBe('AVAILABLE');

    const m = await db.execute({ sql: `SELECT endDate FROM "VehicleMaintenance" WHERE vehicleId = 'v-1'`, args: [] });
    expect(m.rows[0].endDate).toContain(new Date().toISOString().split('T')[0]);

    // Verify GET /api/vehicles/[id] preserves status AVAILABLE and activeMaintenance is null
    const getRes = await GETVehicle(new Request('http://localhost/api/vehicles/VSAV%2001'), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.status).toBe('AVAILABLE');
    expect(getJson.activeMaintenance).toBeNull();

    // Verify GET /api/vehicles list also returns status AVAILABLE
    const listRes = await GETVehicles();
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    const v1 = listJson.find((v: { id: string }) => v.id === 'v-1');
    expect(v1.status).toBe('AVAILABLE');
  });
});
