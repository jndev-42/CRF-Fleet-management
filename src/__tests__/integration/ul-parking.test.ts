import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { GET, POST } from '@/app/api/ul/route';
import { PATCH } from '@/app/api/ul/[id]/route';
import { auth } from '@/auth';
import { db } from './setup';

const mockedAuth = vi.mocked(auth);

describe('UL default parking spots API (/api/ul)', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await db.execute(`DELETE FROM "UniteLocale"`);
  });

  it('crée une UL avec des emplacements de parking par défaut (POST /api/ul)', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@test.com', roles: ['SUPER_ADMIN'] },
    } as never);

    const body = {
      name: 'UL Lyon 3',
      slug: 'lyon-3',
      phoneNumbers: [{ label: 'Fixe', number: '04 00 00 00 00' }],
      defaultParkingSpots: ['Garage Principal', 'Place 12 Hangar'],
    };

    const req = new Request('http://localhost/api/ul', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.defaultParkingSpots).toEqual(['Garage Principal', 'Place 12 Hangar']);

    // Vérifier en DB
    const dbRes = await db.execute({
      sql: `SELECT defaultParkingSpots FROM "UniteLocale" WHERE id = ?`,
      args: ['ul-lyon-3'],
    });
    expect(dbRes.rows.length).toBe(1);
    expect(JSON.parse(dbRes.rows[0].defaultParkingSpots as string)).toEqual(['Garage Principal', 'Place 12 Hangar']);
  });

  it('met à jour les emplacements de parking par défaut d’une UL (PATCH /api/ul/[id])', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@test.com', roles: ['SUPER_ADMIN'] },
    } as never);

    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, defaultParkingSpots) VALUES (?, ?, ?, ?)`,
      args: ['ul-paris-18', 'Paris 18', 'paris-18', JSON.stringify(['Baigneur'])],
    });

    const req = new Request('http://localhost/api/ul/ul-paris-18', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defaultParkingSpots: ['Baigneur (devant l’UL)', 'Parking Aubervilliers', 'Cour Intérieure'],
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'ul-paris-18' }) });
    expect(res.status).toBe(200);

    // Vérifier la mise à jour
    const dbRes = await db.execute({
      sql: `SELECT defaultParkingSpots FROM "UniteLocale" WHERE id = ?`,
      args: ['ul-paris-18'],
    });
    expect(JSON.parse(dbRes.rows[0].defaultParkingSpots as string)).toEqual([
      'Baigneur (devant l’UL)',
      'Parking Aubervilliers',
      'Cour Intérieure',
    ]);
  });

  it('retourne les emplacements de parking par défaut dans la liste des UL (GET /api/ul)', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'user@test.com', roles: ['SECOURISTE'] },
    } as never);

    await db.execute({
      sql: `INSERT INTO "UniteLocale" (id, name, slug, defaultParkingSpots) VALUES (?, ?, ?, ?)`,
      args: ['ul-test', 'UL Test', 'ul-test', JSON.stringify(['Spot A', 'Spot B'])],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    const testUl = data.uls.find((u: { id: string }) => u.id === 'ul-test');
    expect(testUl).toBeDefined();
    expect(testUl.defaultParkingSpots).toEqual(['Spot A', 'Spot B']);
  });
});
