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
import { db, seedVehicle } from './setup';

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
    });
    expect(dbRes.rows[0].dtCode).toBe('DT 75');
  });

  it('met à jour le dtCode d’une UL (PATCH /api/ul/[id])', async () => {
    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-17', 'Paris 17', 'paris-17', 'DT 75')`,
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
    });
    expect(dbRes.rows[0].dtCode).toBe('DT Paris Nord');
  });

  it('retourne le dtCode dans la liste des UL (GET /api/ul)', async () => {
    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-18', 'Paris 18', 'paris-18', 'DT 75')`,
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
    });
    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-17', 'Paris 17', 'paris-17', 'DT 75')`,
    });
    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-lyon-01', 'Lyon 01', 'lyon-01', 'DT 69')`,
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
    });
    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, dtCode) VALUES ('ul-paris-17', 'Paris 17', 'paris-17', 'DT 75')`,
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
