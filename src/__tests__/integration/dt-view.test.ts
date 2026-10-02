/**
 * Integration tests for DT de rattachement and Vision DT (vehicles & calendar).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/stamp', () => ({ compressStampImage: vi.fn().mockImplementation((img) => Promise.resolve(img)) }));

import { GET as GET_UL, POST as POST_UL } from '@/app/api/ul/route';
import { PATCH as PATCH_UL } from '@/app/api/ul/[id]/route';
import { GET as GET_VEHICLES } from '@/app/api/vehicles/route';
import { GET as GET_CALENDAR } from '@/app/api/vehicles/calendar/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedTrip } from './setup';

const mockedAuth = vi.mocked(auth);

describe('DT de rattachement — UL management', () => {
  beforeEach(async () => {
    await db.execute(`DELETE FROM "UniteLocale"`);
  });

  it('crée une UL avec un dtCode (POST /api/ul)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['SUPER_ADMIN'] } } as never);

    const req = new Request('http://localhost/api/ul', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Paris 18',
        slug: 'paris-18',
        dtCode: 'DT 75',
      }),
    });

    const res = await POST_UL(req);
    expect(res.status).toBe(201);
    const data = await res.json() as { dtCode: string };
    expect(data.dtCode).toBe('DT 75');

    // Verify DB persistence
    const dbRes = await db.execute({
      sql: `SELECT dtCode FROM "UniteLocale" WHERE id = 'ul-paris-18'`,
      args: [],
    });
    expect(dbRes.rows[0].dtCode).toBe('DT 75');
  });

  it('met à jour le dtCode d’une UL (PATCH /api/ul/[id])', async () => {
    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-17', 'Paris 17', 'paris-17', 'DT 75')`,
      args: [],
    });

    mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', roles: ['SUPER_ADMIN'] } } as never);

    const req = new Request('http://localhost/api/ul/ul-paris-17', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dtCode: 'DT Paris Nord' }),
    });

    const res = await PATCH_UL(req, { params: Promise.resolve({ id: 'ul-paris-17' }) });
    expect(res.status).toBe(200);

    const dbRes = await db.execute({
      sql: `SELECT dtCode FROM "UniteLocale" WHERE id = 'ul-paris-17'`,
      args: [],
    });
    expect(dbRes.rows[0].dtCode).toBe('DT Paris Nord');
  });

  it('retourne le dtCode dans la liste des UL (GET /api/ul)', async () => {
    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-18', 'Paris 18', 'paris-18', 'DT 75')`,
      args: [],
    });

    mockedAuth.mockResolvedValue({ user: { email: 'user@dev.local', roles: ['CHVL'] } } as never);

    const res = await GET_UL();
    expect(res.status).toBe(200);
    const data = await res.json() as { uls: Array<{ id: string; dtCode: string | null }> };
    expect(data.uls.length).toBe(1);
    expect(data.uls[0].dtCode).toBe('DT 75');
  });
});

describe('Vision DT — GET /api/vehicles?view=dt', () => {
  beforeEach(async () => {
    await db.execute(`DELETE FROM "Vehicle"`);
    await db.execute(`DELETE FROM "UniteLocale"`);

    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-18', 'Paris 18', 'paris-18', 'DT 75')`,
      args: [],
    });
    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-17', 'Paris 17', 'paris-17', 'DT 75')`,
      args: [],
    });
    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-lyon-01', 'Lyon 01', 'lyon-01', 'DT 69')`,
      args: [],
    });

    await seedVehicle({ id: 'v-p18-1', name: 'VSAV 18', type: 'VPSP', plate: 'AA-111-AA', ulId: 'ul-paris-18' });
    await seedVehicle({ id: 'v-p17-1', name: 'VSAV 17', type: 'VPSP', plate: 'BB-222-BB', ulId: 'ul-paris-17' });
    await seedVehicle({ id: 'v-ly1-1', name: 'VSAV 69', type: 'VPSP', plate: 'CC-333-CC', ulId: 'ul-lyon-01' });
  });

  it('retourne 401 si non authentifié', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const req = new Request('http://localhost/api/vehicles?view=dt');
    const res = await GET_VEHICLES(req);
    expect(res.status).toBe(401);
  });

  it('retourne 403 pour un utilisateur sans rôle DT', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
    const req = new Request('http://localhost/api/vehicles?view=dt');
    const res = await GET_VEHICLES(req);
    expect(res.status).toBe(403);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('Accès réservé au rôle DT');
  });

  it('retourne 400 si l’UL de l’utilisateur n’a pas de dtCode', async () => {
    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-no-dt', 'No DT', 'no-dt', NULL)`,
      args: [],
    });
    mockedAuth.mockResolvedValue({ user: { email: 'dt@dev.local', roles: ['DT'], ulId: 'ul-no-dt' } } as never);
    const req = new Request('http://localhost/api/vehicles?view=dt');
    const res = await GET_VEHICLES(req);
    expect(res.status).toBe(400);
  });

  it('happy path : retourne tous les véhicules des ULs de la même DT', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'dt@dev.local', roles: ['DT'], ulId: 'ul-paris-18' } } as never);
    const req = new Request('http://localhost/api/vehicles?view=dt');
    const res = await GET_VEHICLES(req);
    expect(res.status).toBe(200);

    const vehicles = await res.json() as Array<{ id: string; name: string; ulName: string }>;
    expect(vehicles.length).toBe(2);
    const names = vehicles.map(v => v.name);
    expect(names).toContain('VSAV 18');
    expect(names).toContain('VSAV 17');
    expect(names).not.toContain('VSAV 69');
  });
});

describe('Vision DT — GET /api/vehicles/calendar?view=dt', () => {
  beforeEach(async () => {
    await db.execute(`DELETE FROM "Reservation"`);
    await db.execute(`DELETE FROM "Trip"`);
    await db.execute(`DELETE FROM "Vehicle"`);
    await db.execute(`DELETE FROM "UniteLocale"`);

    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-18', 'Paris 18', 'paris-18', 'DT 75')`,
      args: [],
    });
    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-17', 'Paris 17', 'paris-17', 'DT 75')`,
      args: [],
    });

    await seedVehicle({ id: 'v-p18-1', name: 'VSAV 18', type: 'VPSP', plate: 'AA-111-AA', ulId: 'ul-paris-18' });
    await seedVehicle({ id: 'v-p17-1', name: 'VSAV 17', type: 'VPSP', plate: 'BB-222-BB', ulId: 'ul-paris-17' });
  });

  it('retourne 403 pour un utilisateur sans rôle DT', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
    const req = new Request('http://localhost/api/vehicles/calendar?view=dt');
    const res = await GET_CALENDAR(req);
    expect(res.status).toBe(403);
  });

  it('happy path : retourne les véhicules et évènements de toutes les ULs de la DT', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'dt@dev.local', roles: ['DT'], ulId: 'ul-paris-18' } } as never);
    const req = new Request('http://localhost/api/vehicles/calendar?view=dt');
    const res = await GET_CALENDAR(req);
    expect(res.status).toBe(200);

    const data = await res.json() as { vehicles: Array<{ id: string; name: string }> };
    expect(data.vehicles.length).toBe(2);
    const names = data.vehicles.map(v => v.name);
    expect(names).toContain('VSAV 18');
    expect(names).toContain('VSAV 17');
  });
});

describe('Vision DT — disponibilité GET /api/vehicles?view=dt&from=&to=', () => {
  type DtVehicle = {
    id: string;
    availability?: {
      status: string;
      missionSince: string | null;
      reservations: Array<{ userName: string; status: string; reason: string | null; startTime: string; endTime: string }>;
    };
  };

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  // Fenêtre future : J+3, 08:00 → 20:00 (UTC, peu importe : seules les positions relatives comptent).
  const base = new Date(Date.now() + 3 * DAY);
  base.setUTCHours(8, 0, 0, 0);
  const FROM = base.toISOString();
  const TO = new Date(base.getTime() + 12 * HOUR).toISOString();

  const dtUser = { user: { email: 'dt@dev.local', roles: ['DT'], ulId: 'ul-paris-18' } };

  function dtRequest(query: string) {
    return new Request(`http://localhost/api/vehicles?${query}`);
  }

  async function fetchDt(query: string) {
    const res = await GET_VEHICLES(dtRequest(query));
    expect(res.status).toBe(200);
    const vehicles = await res.json() as DtVehicle[];
    return Object.fromEntries(vehicles.map(v => [v.id, v]));
  }

  async function seedReservation(o: { id: string; vehicleId: string; startTime: string; endTime: string; status: string; reason?: string | null }) {
    await db.execute({
      sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, reason, status) VALUES (?,?,?,?,?,?,?,?)`,
      args: [o.id, o.vehicleId, 'alice@dev.local', 'Alice Martin', o.startTime, o.endTime, o.reason ?? null, o.status],
    });
  }

  async function seedMaintenance(o: { id: string; vehicleId: string; startDate: string; endDate: string | null }) {
    await db.execute({
      sql: `INSERT INTO "VehicleMaintenance" (id, vehicleId, startDate, endDate, reason) VALUES (?,?,?,?,?)`,
      args: [o.id, o.vehicleId, o.startDate, o.endDate, 'Révision'],
    });
  }

  beforeEach(async () => {
    await db.execute(`DELETE FROM "Reservation"`);
    await db.execute(`DELETE FROM "Trip"`);
    await db.execute(`DELETE FROM "VehicleMaintenance"`);
    await db.execute(`DELETE FROM "Vehicle"`);
    await db.execute(`DELETE FROM "UniteLocale"`);

    await db.execute(`INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-18', 'Paris 18', 'paris-18', 'DT 75')`);
    await db.execute(`INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-17', 'Paris 17', 'paris-17', 'DT 75')`);

    await seedVehicle({ id: 'v-free', name: 'VSAV 1', type: 'VPSP', plate: 'AA-111-AA', ulId: 'ul-paris-18' });
    await seedVehicle({ id: 'v-resa', name: 'VSAV 2', type: 'VPSP', plate: 'BB-222-BB', ulId: 'ul-paris-17' });
    await seedVehicle({ id: 'v-trip', name: 'VSAV 3', type: 'VPSP', plate: 'CC-333-CC', ulId: 'ul-paris-17', status: 'IN_USE' });
    await seedVehicle({ id: 'v-maint', name: 'VL 4', type: 'VL', plate: 'DD-444-DD', ulId: 'ul-paris-18' });
    // Conducteur référencé par `seedTrip` (clé étrangère Trip.driverId).
    await db.execute(`INSERT OR IGNORE INTO "User" (id, email, name) VALUES ('user-driver', 'driver@dev.local', 'Driver')`);
  });

  it('retourne 401 si non authentifié', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET_VEHICLES(dtRequest(`view=dt&from=${FROM}&to=${TO}`));
    expect(res.status).toBe(401);
  });

  it('retourne 403 pour un utilisateur sans rôle DT', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
    const res = await GET_VEHICLES(dtRequest(`view=dt&from=${FROM}&to=${TO}`));
    expect(res.status).toBe(403);
  });

  it.each([
    ['from seul', () => `from=${encodeURIComponent(FROM)}`, null],
    ['to seul', () => `to=${encodeURIComponent(TO)}`, null],
    ['to ≤ from', () => `from=${encodeURIComponent(TO)}&to=${encodeURIComponent(FROM)}`, 'La fin doit être après le début.'],
    ['to ≤ maintenant', () => `from=${encodeURIComponent(new Date(Date.now() - 2 * DAY).toISOString())}&to=${encodeURIComponent(new Date(Date.now() - DAY).toISOString())}`, null],
    ['plus de 31 jours', () => `from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(new Date(base.getTime() + 32 * DAY).toISOString())}`, 'Période limitée à 31 jours.'],
    ['date non ISO', () => `from=demain&to=${encodeURIComponent(TO)}`, null],
  ])('retourne 400 avec un message français : %s', async (_label, query, expectedMessage) => {
    mockedAuth.mockResolvedValue(dtUser as never);
    const res = await GET_VEHICLES(dtRequest(`view=dt&${query()}`));
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(typeof data.error).toBe('string');
    expect(data.error.length).toBeGreaterThan(0);
    if (expectedMessage) expect(data.error).toBe(expectedMessage);
  });

  it('hors Vue DT : from/to ignorés, pas de champ availability', async () => {
    mockedAuth.mockResolvedValue(dtUser as never);
    const res = await GET_VEHICLES(dtRequest('from=nimportequoi'));
    expect(res.status).toBe(200);
    const vehicles = await res.json() as DtVehicle[];
    expect(vehicles.map(v => v.id).sort()).toEqual(['v-free', 'v-maint']);
    expect(vehicles.every(v => v.availability === undefined)).toBe(true);
  });

  it('happy path Maintenant : availability calculée sur l’instant présent', async () => {
    mockedAuth.mockResolvedValue(dtUser as never);
    await seedTrip({ id: 'trip-open', vehicleId: 'v-trip', checkOutAt: new Date(Date.now() - 2 * HOUR).toISOString() });
    await seedReservation({
      id: 'r-now', vehicleId: 'v-resa', status: 'VALIDATED', reason: 'Formation',
      startTime: new Date(Date.now() - HOUR).toISOString(), endTime: new Date(Date.now() + HOUR).toISOString(),
    });
    await seedMaintenance({ id: 'm-now', vehicleId: 'v-maint', startDate: new Date(Date.now() - DAY).toISOString().split('T')[0], endDate: null });

    const byId = await fetchDt('view=dt');
    expect(byId['v-free'].availability?.status).toBe('AVAILABLE');
    expect(byId['v-resa'].availability?.status).toBe('RESERVED');
    expect(byId['v-trip'].availability?.status).toBe('IN_USE');
    expect(byId['v-maint'].availability?.status).toBe('MAINTENANCE');
  });

  it('happy path Période : RESERVED avec réservant, statut et motif', async () => {
    mockedAuth.mockResolvedValue(dtUser as never);
    await seedReservation({
      id: 'r-pending', vehicleId: 'v-resa', status: 'PENDING', reason: 'DPS semi-marathon',
      startTime: new Date(base.getTime() + 2 * HOUR).toISOString(), endTime: new Date(base.getTime() + 4 * HOUR).toISOString(),
    });
    // Refusée : ignorée.
    await seedReservation({
      id: 'r-rejected', vehicleId: 'v-free', status: 'REJECTED',
      startTime: new Date(base.getTime() + 2 * HOUR).toISOString(), endTime: new Date(base.getTime() + 4 * HOUR).toISOString(),
    });
    // Finit pile au début de la fenêtre : pas de chevauchement.
    await seedReservation({
      id: 'r-before', vehicleId: 'v-free', status: 'VALIDATED',
      startTime: new Date(base.getTime() - 3 * HOUR).toISOString(), endTime: FROM,
    });

    const byId = await fetchDt(`view=dt&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`);
    expect(byId['v-free'].availability).toEqual({ status: 'AVAILABLE', missionSince: null, reservations: [] });
    expect(byId['v-resa'].availability?.status).toBe('RESERVED');
    expect(byId['v-resa'].availability?.reservations).toEqual([
      expect.objectContaining({ userName: 'Alice Martin', status: 'PENDING', reason: 'DPS semi-marathon' }),
    ]);
  });

  it('happy path Période : trajet ouvert sur période future → POTENTIAL avec missionSince', async () => {
    mockedAuth.mockResolvedValue(dtUser as never);
    const checkOutAt = new Date(Date.now() - 5 * HOUR).toISOString();
    await seedTrip({ id: 'trip-open', vehicleId: 'v-trip', checkOutAt });

    const byId = await fetchDt(`view=dt&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`);
    expect(byId['v-trip'].availability?.status).toBe('POTENTIAL');
    expect(byId['v-trip'].availability?.missionSince).toBe(checkOutAt);
  });

  it('happy path Période entamée : trajet ouvert → IN_USE', async () => {
    mockedAuth.mockResolvedValue(dtUser as never);
    await seedTrip({ id: 'trip-open', vehicleId: 'v-trip', checkOutAt: new Date(Date.now() - 5 * HOUR).toISOString() });
    const from = new Date(Date.now() - HOUR).toISOString();
    const to = new Date(Date.now() + 5 * HOUR).toISOString();

    const byId = await fetchDt(`view=dt&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    expect(byId['v-trip'].availability?.status).toBe('IN_USE');
  });

  it('maintenance au format ISO (format de production) : chevauchante → MAINTENANCE, terminée avant le début → non', async () => {
    mockedAuth.mockResolvedValue(dtUser as never);
    const day = FROM.split('T')[0];
    // Format écrit par les évènements de maintenance : journée ISO complète.
    await seedMaintenance({ id: 'm-iso-in', vehicleId: 'v-maint', startDate: `${day}T00:00:00.000Z`, endDate: `${day}T23:59:59.999Z` });
    const before = new Date(base.getTime() - 2 * DAY).toISOString().split('T')[0];
    await seedMaintenance({ id: 'm-iso-before', vehicleId: 'v-free', startDate: `${before}T00:00:00.000Z`, endDate: `${before}T23:59:59.999Z` });

    const byId = await fetchDt(`view=dt&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`);
    expect(byId['v-maint'].availability?.status).toBe('MAINTENANCE');
    expect(byId['v-free'].availability?.status).toBe('AVAILABLE');
  });

  it('happy path Période : maintenance (date seule) + réservation → MAINTENANCE', async () => {
    mockedAuth.mockResolvedValue(dtUser as never);
    const day = FROM.split('T')[0];
    await seedMaintenance({ id: 'm-1', vehicleId: 'v-maint', startDate: day, endDate: day });
    await seedReservation({
      id: 'r-maint', vehicleId: 'v-maint', status: 'VALIDATED',
      startTime: new Date(base.getTime() + HOUR).toISOString(), endTime: new Date(base.getTime() + 2 * HOUR).toISOString(),
    });

    const byId = await fetchDt(`view=dt&from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`);
    expect(byId['v-maint'].availability?.status).toBe('MAINTENANCE');
    expect(byId['v-maint'].availability?.reservations).toHaveLength(1);
  });
});
