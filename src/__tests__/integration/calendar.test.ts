/**
 * Integration tests — GET /api/vehicles/calendar
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/vehicles/calendar/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

interface CalendarTrip {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  driverName: string;
  secondDriverName: string | null;
  missionType: string;
  missionName: string | null;
  checkOutAt: string;
  checkInAt: string | null;
  isOngoing: boolean;
}

function makeRequest(params: string = ''): Request {
  return new Request(`http://localhost/api/vehicles/calendar${params ? `?${params}` : ''}`, {
    method: 'GET',
  });
}

beforeEach(async () => {
  await seedUser({ id: 'user-admin', email: 'admin@dev.local', name: 'Admin User', ulId: 'ul-paris' });
  await seedVehicle({ id: 'v-1', name: 'VSAV 01', plate: 'AB-123-CD', ulId: 'ul-paris' });
  await seedVehicle({ id: 'v-2', name: 'VLP 02', plate: 'EF-456-GH', ulId: 'ul-paris' });
});

describe('GET /api/vehicles/calendar', () => {
  it('should return 401 when not authenticated', async () => {
    // @ts-expect-error null session for test
    mockedAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Non authentifié');
  });

  it('should return empty arrays if user has no ulId', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'default' },
    } as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ vehicles: [], reservations: [], trips: [] });
  });

  it('should return monthly reservations and trips including ongoing trips', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    } as never);

    // Insert a reservation in July 2026
    await db.execute({
      sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, reason, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'res-1',
        'v-1',
        'admin@dev.local',
        'Admin User',
        '2026-07-10T10:00:00.000Z',
        '2026-07-10T18:00:00.000Z',
        'Urgence sanitaire',
        'VALIDATED',
      ],
    });

    // Insert a completed trip
    await db.execute({
      sql: `INSERT INTO Trip (id, vehicleId, driverId, missionType, checkOutAt, checkInAt)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        'trip-1',
        'v-1',
        'user-admin',
        'Garde SAMU',
        '2026-07-05T08:00:00.000Z',
        '2026-07-05T20:00:00.000Z',
      ],
    });

    // Insert an ongoing trip (checkInAt is NULL)
    await db.execute({
      sql: `INSERT INTO Trip (id, vehicleId, driverId, missionType, checkOutAt, checkInAt)
            VALUES (?, ?, ?, ?, ?, NULL)`,
      args: [
        'trip-ongoing',
        'v-2',
        'user-admin',
        'Poste de secours',
        '2026-07-15T14:00:00.000Z',
      ],
    });

    // Insert a maintenance event
    await db.execute({
      sql: `INSERT INTO "VehicleMaintenance" (id, vehicleId, startDate, endDate, reason)
            VALUES (?, ?, ?, ?, ?)`,
      args: ['maint-1', 'v-1', '2026-07-20', null, 'Panne batterie'],
    });

    const res = await GET(makeRequest('month=2026-07'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.month).toBe('2026-07');
    expect(data.vehicles).toHaveLength(2);

    expect(data.reservations).toHaveLength(1);
    expect(data.reservations[0].id).toBe('res-1');
    expect(data.reservations[0].vehicleName).toBe('VSAV 01');

    expect(data.trips).toHaveLength(2);

    const completedTrip = data.trips.find((t: CalendarTrip) => t.id === 'trip-1');
    expect(completedTrip).toBeDefined();
    expect(completedTrip?.isOngoing).toBe(false);

    const ongoingTrip = data.trips.find((t: CalendarTrip) => t.id === 'trip-ongoing');
    expect(ongoingTrip).toBeDefined();
    expect(ongoingTrip?.isOngoing).toBe(true);
    expect(ongoingTrip?.checkInAt).toBeNull();

    expect(data.maintenances).toHaveLength(1);
    expect(data.maintenances[0].id).toBe('maint-1');
    expect(data.maintenances[0].reason).toBe('Panne batterie');
    expect(data.maintenances[0].isEndDateUnknown).toBe(true);
  });

  it('should filter by vehicleId when vehicleId parameter is provided', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    } as never);

    await db.execute({
      sql: `INSERT INTO Trip (id, vehicleId, driverId, missionType, checkOutAt, checkInAt)
            VALUES (?, ?, ?, ?, ?, NULL)`,
      args: ['trip-v1', 'v-1', 'user-admin', 'Garde', '2026-07-15T14:00:00.000Z'],
    });

    await db.execute({
      sql: `INSERT INTO Trip (id, vehicleId, driverId, missionType, checkOutAt, checkInAt)
            VALUES (?, ?, ?, ?, ?, NULL)`,
      args: ['trip-v2', 'v-2', 'user-admin', 'Formation', '2026-07-16T09:00:00.000Z'],
    });

    const res = await GET(makeRequest('month=2026-07&vehicleId=v-1'));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.vehicles).toHaveLength(1);
    expect(data.vehicles[0].id).toBe('v-1');
    expect(data.trips).toHaveLength(1);
    expect(data.trips[0].id).toBe('trip-v1');
  });
});
