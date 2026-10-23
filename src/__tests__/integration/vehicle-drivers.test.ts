import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { GET } from '@/app/api/vehicles/[id]/drivers/route';
import { auth } from '@/auth';
import { seedVehicle, seedUser, seedRoles, seedUserRole } from './setup';

const mockedAuth = vi.mocked(auth);

function asUser(id: string, roles: string[], ulId = 'ul-paris-18') {
  mockedAuth.mockResolvedValue({
    user: { id, name: id, email: `${id}@croix-rouge.fr`, roles, ulId },
    expires: '2026-01-01',
  } as never);
}

function getDrivers(id: string) {
  return GET(new Request(`http://localhost/api/vehicles/${id}/drivers`), { params: Promise.resolve({ id }) });
}

describe('GET /api/vehicles/[id]/drivers', () => {
  beforeEach(async () => {
    mockedAuth.mockReset();
    await seedRoles();
    await seedUser({ id: 'usr-me', email: 'me@croix-rouge.fr', name: 'Moi' });
    await seedUser({ id: 'usr-chvl', email: 'chvl@croix-rouge.fr', name: 'Alice CHVL' });
    await seedUser({ id: 'usr-chvpsp', email: 'chvpsp@croix-rouge.fr', name: 'Bruno CHVPSP' });
    await seedUser({ id: 'usr-inactif', email: 'inactif@croix-rouge.fr', name: 'Claire Inactive' });
    await seedUserRole('usr-me', 'CHVL');
    await seedUserRole('usr-chvl', 'CHVL');
    await seedUserRole('usr-chvpsp', 'CHVPSP');
    await seedUserRole('usr-inactif', 'CHVL');
    await seedUserRole('usr-inactif', 'INACTIF');
    await seedVehicle({ id: 'VL01', name: 'VL 01', type: 'VL', ulId: 'ul-paris-18' });
    await seedVehicle({ id: 'VPSP01', name: 'VPSP 01', type: 'VPSP', ulId: 'ul-paris-18' });
    await seedVehicle({ id: 'VL-LYON', name: 'VL Lyon', type: 'VL', ulId: 'ul-lyon' });
  });

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null as never);
    expect((await getDrivers('VL01')).status).toBe(401);
  });

  it('returns 403 for an inactive account', async () => {
    asUser('usr-inactif', ['CHVL', 'INACTIF']);
    expect((await getDrivers('VL01')).status).toBe(403);
  });

  it('returns 403 for an account without any role', async () => {
    asUser('usr-me', []);
    expect((await getDrivers('VL01')).status).toBe(403);
  });

  it('returns 404 for an unknown vehicle', async () => {
    asUser('usr-me', ['CHVL']);
    expect((await getDrivers('inconnu')).status).toBe(404);
  });

  it("returns 404 for a vehicle of another UL (cloisonnement comme POST /api/trips)", async () => {
    asUser('usr-me', ['CHVL']);
    expect((await getDrivers('VL-LYON')).status).toBe(404);
  });

  it('liste les CHVL pour un VL à un simple chauffeur, sans lui-même ni les inactifs', async () => {
    asUser('usr-me', ['CHVL']);
    const res = await getDrivers('VL01');
    expect(res.status).toBe(200);
    const { users } = await res.json();
    expect(users).toEqual([{ id: 'usr-chvl', name: 'Alice CHVL', email: 'chvl@croix-rouge.fr' }]);
  });

  it('liste les CHVPSP pour un VPSP', async () => {
    asUser('usr-chvpsp', ['CHVPSP']);
    const { users } = await (await getDrivers('VPSP01')).json();
    expect(users).toEqual([]);
    asUser('usr-me', ['CHVL']);
    const again = await (await getDrivers('VPSP01')).json();
    expect(again.users.map((u: { id: string }) => u.id)).toEqual(['usr-chvpsp']);
  });

  it('un gestionnaire (ADMIN) de la même UL obtient aussi la liste', async () => {
    asUser('usr-admin', ['ADMIN']);
    const { users } = await (await getDrivers('VL01')).json();
    expect(users.map((u: { id: string }) => u.id).sort()).toEqual(['usr-chvl', 'usr-me']);
  });

  it('un SUPER_ADMIN voit les conducteurs pour un véhicule de toute UL', async () => {
    asUser('usr-sa', ['SUPER_ADMIN'], 'ul-paris-18');
    const res = await getDrivers('VL-LYON');
    expect(res.status).toBe(200);
    const { users } = await res.json();
    expect(users.map((u: { id: string }) => u.id).sort()).toEqual(['usr-chvl', 'usr-me']);
  });
});
