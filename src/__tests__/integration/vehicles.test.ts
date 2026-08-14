/**
 * Tests d'intégration — POST /api/vehicles et PATCH /api/vehicles/[id]
 *
 * Stratégie : appel direct des handlers Next.js avec un vrai SQLite.
 * - Auth mockée (pas de vraie session)
 * - Pas de services externes impliqués
 *
 * Cas couverts :
 *  POST /api/vehicles
 *   1. 401 sans session
 *   2. 403 pour un non-ADMIN (rôle CHVL)
 *   3. 400 Zod — maxFuelCapacity: 0 (min(1))
 *   4. Happy path avec capacité (maxFuelCapacity enregistré en DB)
 *   5. Happy path sans capacité (maxFuelCapacity NULL en DB)
 *   6. 400 Zod — maxBatteryCapacityKwh: 0 (min(1))
 *   7. Happy path EV avec maxBatteryCapacityKwh: 52 enregistré en DB
 *
 *  PATCH /api/vehicles/[id]
 *   8. Mise à jour de maxFuelCapacity 56 → 80 vérifiée en DB
 *   9. Mise à jour de maxBatteryCapacityKwh vérifiée en DB
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/drive', () => ({ deleteDriveFolder: vi.fn() }));

import { POST } from '@/app/api/vehicles/route';
import { PATCH } from '@/app/api/vehicles/[id]/route';
import { auth } from '@/auth';
import { db } from './setup';
import { seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/vehicles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/vehicles/VL186', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validVehicleBody = {
  name: 'VL 486',
  type: 'VL',
  plate: 'AB-123-CD',
  fuelLevel: 80,
  mileage: 5000,
  fuelType: 'Diesel',
};

describe('POST /api/vehicles — auth & authorization', () => {
  it('retourne 401 sans session', async () => {
    // @ts-expect-error — null session for test
    mockedAuth.mockResolvedValue(null);
    const res = await POST(makePostRequest(validVehicleBody));
    expect(res.status).toBe(401);
  });

  it('retourne 403 pour un utilisateur non-ADMIN (rôle CHVL)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', roles: ['CHVL'] } } as never);
    const res = await POST(makePostRequest(validVehicleBody));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/vehicles — validation Zod', () => {
  it('retourne 400 si maxFuelCapacity vaut 0 (min 1)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'] } } as never);
    const res = await POST(makePostRequest({ ...validVehicleBody, maxFuelCapacity: 0 }));
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('Données invalides');
  });
});

describe('POST /api/vehicles — happy path', () => {
  it('crée un véhicule avec maxFuelCapacity et le persiste en DB', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'] } } as never);

    const res = await POST(makePostRequest({ ...validVehicleBody, maxFuelCapacity: 56 }));
    expect(res.status).toBe(201);

    const body = await res.json() as { maxFuelCapacity: number | null };
    expect(body.maxFuelCapacity).toBe(56);

    // Verify persisted in DB
    const row = await db.execute({
      sql: `SELECT maxFuelCapacity FROM "Vehicle" WHERE name = ?`,
      args: ['VL 486'],
    });
    expect(row.rows[0].maxFuelCapacity).toBe(56);
  });

  it('crée un véhicule sans maxFuelCapacity (NULL en DB)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'] } } as never);

    const res = await POST(makePostRequest(validVehicleBody));
    expect(res.status).toBe(201);

    const body = await res.json() as { maxFuelCapacity: number | null };
    expect(body.maxFuelCapacity).toBeNull();

    const row = await db.execute({
      sql: `SELECT maxFuelCapacity FROM "Vehicle" WHERE name = ?`,
      args: ['VL 486'],
    });
    expect(row.rows[0].maxFuelCapacity).toBeNull();
  });
});

describe('POST /api/vehicles — validation Zod maxBatteryCapacityKwh', () => {
  it('retourne 400 si maxBatteryCapacityKwh vaut 0 (min 1)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'] } } as never);
    const res = await POST(makePostRequest({ ...validVehicleBody, fuelType: 'Électrique', maxBatteryCapacityKwh: 0 }));
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('Données invalides');
  });
});

describe('POST /api/vehicles — happy path EV avec maxBatteryCapacityKwh', () => {
  it('crée un VE avec maxBatteryCapacityKwh: 52 et le persiste en DB', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'] } } as never);

    const res = await POST(makePostRequest({ ...validVehicleBody, fuelType: 'Électrique', maxBatteryCapacityKwh: 52 }));
    expect(res.status).toBe(201);

    const body = await res.json() as { maxBatteryCapacityKwh: number | null };
    expect(body.maxBatteryCapacityKwh).toBe(52);

    const row = await db.execute({
      sql: `SELECT maxBatteryCapacityKwh FROM "Vehicle" WHERE name = ?`,
      args: ['VL 486'],
    });
    expect(row.rows[0].maxBatteryCapacityKwh).toBe(52);
  });
});

describe('PATCH /api/vehicles/[id] — mise à jour maxFuelCapacity', () => {
  it('met à jour maxFuelCapacity de 56 vers 80 et vérifie en DB', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);

    // Seed a vehicle with maxFuelCapacity = 56
    await seedVehicle({ id: 'VL001', name: 'VL186', maxFuelCapacity: 56 });

    const res = await PATCH(
      makePatchRequest({ maxFuelCapacity: 80 }),
      { params: Promise.resolve({ id: 'VL186' }) }
    );
    expect(res.status).toBe(200);

    const row = await db.execute({
      sql: `SELECT maxFuelCapacity FROM "Vehicle" WHERE name = ?`,
      args: ['VL186'],
    });
    expect(row.rows[0].maxFuelCapacity).toBe(80);
  });
});

describe('PATCH /api/vehicles/[id] — mise à jour maxBatteryCapacityKwh', () => {
  it('met à jour maxBatteryCapacityKwh et vérifie en DB', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);

    await seedVehicle({ id: 'VL001', name: 'VL186', maxBatteryCapacityKwh: 40 });

    const res = await PATCH(
      makePatchRequest({ maxBatteryCapacityKwh: 52 }),
      { params: Promise.resolve({ id: 'VL186' }) }
    );
    expect(res.status).toBe(200);

    const row = await db.execute({
      sql: `SELECT maxBatteryCapacityKwh FROM "Vehicle" WHERE name = ?`,
      args: ['VL186'],
    });
    expect(row.rows[0].maxBatteryCapacityKwh).toBe(52);
  });
});

describe('POST /api/vehicles — duplicate checks', () => {
  it('retourne 400 si un véhicule avec le même nom existe déjà', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);

    // Seed a vehicle
    await seedVehicle({ id: 'VL001', name: 'VL186', plate: 'AA-111-AA' });

    const res = await POST(makePostRequest({ ...validVehicleBody, name: 'VL186', plate: 'BB-222-BB' }));
    expect(res.status).toBe(400);

    const body = await res.json() as { error: string };
    expect(body.error).toBe('Un véhicule avec ce nom existe déjà.');
  });

  it('retourne 400 si un véhicule avec la même plaque existe déjà', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);

    // Seed a vehicle
    await seedVehicle({ id: 'VL001', name: 'VL186', plate: 'AA-111-AA' });

    const res = await POST(makePostRequest({ ...validVehicleBody, name: 'VL187', plate: 'AA-111-AA' }));
    expect(res.status).toBe(400);

    const body = await res.json() as { error: string };
    expect(body.error).toBe("Un véhicule avec cette plaque d'immatriculation existe déjà.");
  });
});

describe('PATCH /api/vehicles/[id] — édition des informations du véhicule (ADMIN & SUPER_ADMIN)', () => {
  it('met à jour le nom, la plaque, le VIN et les intervalles de révision par un ADMIN', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);

    await seedVehicle({ id: 'v-100', name: 'VL999', plate: 'XX-123-YY', vin: 'OLDVIN' });

    const res = await PATCH(
      new Request('http://localhost/api/vehicles/VL999', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'VL999-NEW',
          plate: 'ZZ-999-ZZ',
          vin: 'NEWVIN123456789',
          revisionKmInterval: 20000,
          revisionYearInterval: 2,
        }),
      }),
      { params: Promise.resolve({ id: 'VL999' }) }
    );
    expect(res.status).toBe(200);

    const row = await db.execute({
      sql: `SELECT name, plate, vin, revisionKmInterval, revisionYearInterval FROM "Vehicle" WHERE id = ?`,
      args: ['v-100'],
    });
    expect(row.rows[0].name).toBe('VL999-NEW');
    expect(row.rows[0].plate).toBe('ZZ-999-ZZ');
    expect(row.rows[0].vin).toBe('NEWVIN123456789');
    expect(row.rows[0].revisionKmInterval).toBe(20000);
    expect(row.rows[0].revisionYearInterval).toBe(2);
  });

  it('met à jour les informations par un SUPER_ADMIN', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'superadmin@dev.local', roles: ['SUPER_ADMIN'] } } as never);

    await seedVehicle({ id: 'v-101', name: 'VL888', plate: 'WW-111-WW' });

    const res = await PATCH(
      new Request('http://localhost/api/vehicles/VL888', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parkingSpot: 'Place A-12',
          notes: 'Notes mises à jour par superadmin',
        }),
      }),
      { params: Promise.resolve({ id: 'VL888' }) }
    );
    expect(res.status).toBe(200);

    const row = await db.execute({
      sql: `SELECT parkingSpot, notes FROM "Vehicle" WHERE id = ?`,
      args: ['v-101'],
    });
    expect(row.rows[0].parkingSpot).toBe('Place A-12');
    expect(row.rows[0].notes).toBe('Notes mises à jour par superadmin');
  });

  it('retourne 400 en cas de nom en doublon avec un autre véhicule', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);

    await seedVehicle({ id: 'v-201', name: 'VL100', plate: 'AA-100-AA' });
    await seedVehicle({ id: 'v-202', name: 'VL200', plate: 'BB-200-BB' });

    const res = await PATCH(
      new Request('http://localhost/api/vehicles/VL100', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'VL200' }),
      }),
      { params: Promise.resolve({ id: 'VL100' }) }
    );
    expect(res.status).toBe(400);

    const body = await res.json() as { error: string };
    expect(body.error).toBe('Un véhicule avec ce nom existe déjà.');
  });

  it('retourne 400 en cas de plaque en doublon avec un autre véhicule', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);

    await seedVehicle({ id: 'v-301', name: 'VL300', plate: 'AA-300-AA' });
    await seedVehicle({ id: 'v-302', name: 'VL400', plate: 'BB-400-BB' });

    const res = await PATCH(
      new Request('http://localhost/api/vehicles/VL300', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: 'BB-400-BB' }),
      }),
      { params: Promise.resolve({ id: 'VL300' }) }
    );
    expect(res.status).toBe(400);

    const body = await res.json() as { error: string };
    expect(body.error).toBe("Un véhicule avec cette plaque d'immatriculation existe déjà.");
  });

  it('retourne 401 sans session (PATCH)', async () => {
    // @ts-expect-error — null session for test
    mockedAuth.mockResolvedValue(null);

    await seedVehicle({ id: 'v-402', name: 'VL501', plate: 'DD-501-DD' });

    const res = await PATCH(
      new Request('http://localhost/api/vehicles/VL501', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'VL501-EDITED' }),
      }),
      { params: Promise.resolve({ id: 'VL501' }) }
    );
    expect(res.status).toBe(401);
  });

  it('retourne 403 pour un utilisateur sans privilège admin (ex: CHVL)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'user@dev.local', roles: ['CHVL'] } } as never);

    await seedVehicle({ id: 'v-401', name: 'VL500', plate: 'CC-500-CC' });

    const res = await PATCH(
      new Request('http://localhost/api/vehicles/VL500', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'VL500-EDITED' }),
      }),
      { params: Promise.resolve({ id: 'VL500' }) }
    );
    expect(res.status).toBe(403);
  });
});


